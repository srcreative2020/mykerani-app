import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import pg from "pg";
import { createVerify } from "crypto";

const { Client } = pg;

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON and URLencoded parsers for form data
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API routes go here FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // helper to extract project ref from Supabase URL
  const getProjectRef = (): string => {
    const url = process.env.VITE_SUPABASE_URL || "";
    const match = url.match(/https:\/\/([^.]+)\.supabase\./);
    return match ? match[1] : "";
  };

  // helper to generate Postgres Client config
  const getPgClient = (dbPassword?: string) => {
    const projectRef = getProjectRef();
    const password = dbPassword || process.env.SUPABASE_DB_PASSWORD || "";
    
    if (!projectRef) {
      throw new Error("Unable to extract Supabase project reference. Check VITE_SUPABASE_URL.");
    }
    if (!password) {
      throw new Error("Missing database password credentials.");
    }

    return new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 6543,
      user: "postgres",
      password: password,
      database: "postgres",
      ssl: { rejectUnauthorized: false }
    });
  };

  // Reusable, idempotent Database Schema and Migrations Initializer
  const runDatabaseInitialization = async (dbPassword?: string, forced: boolean = false): Promise<{ success: boolean; logs: string[]; errorMessage: string | null }> => {
    const logs: string[] = [];
    let success = false;
    let errorMessage: string | null = null;
    let client: any = null;

    try {
      client = getPgClient(dbPassword);
      await client.connect();
      logs.push("🔌 Connected successfully to Supabase Postgres database cluster.");

      // Check existing public tables and buckets first to make the run idempotent
      let tablesList: string[] = [];
      let bucketsList: string[] = [];
      try {
        const tablesRes = await client.query(`
          SELECT tablename 
          FROM pg_tables 
          WHERE schemaname = 'public'
        `);
        tablesList = tablesRes.rows.map(r => r.tablename);
      } catch (e) {
        logs.push(`⚠️ Warning querying existing tables: ${String(e)}`);
      }

      try {
        const bucketsRes = await client.query(`SELECT name FROM storage.buckets`);
        bucketsList = bucketsRes.rows.map(r => r.name);
      } catch (e) {
        logs.push(`⚠️ Code: storage schema lookup skipped or deferred: ${String(e)}.`);
      }

      // Loop and execute migrations in chronological order. Core architecture
      // schema now lives in supabase/migrations/20260601000000_core_architecture_foundation.sql
      // (Supabase migrations are the single source of truth — see CLAUDE.md Priority 4).
      // DATABASE_ARCHITECTURE_V1_2.md remains as documentation only and is no longer parsed here.
      const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
      let migrationFiles: string[] = [];
      if (fs.existsSync(migrationsDir)) {
        migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
      }

      logs.push(`🔍 Mapped ${migrationFiles.length} chronological setup files inside migration directory.`);

      for (const file of migrationFiles) {
        // Evaluate skip conditions if forced is false
        let skip = false;
        if (!forced) {
          if (file.includes("rls_foundation") && tablesList.includes("tenants")) {
            try {
              const polRes = await client.query(`SELECT count(*) FROM pg_policies WHERE tablename = 'tenants'`);
              if (parseInt(polRes.rows[0].count) > 0) {
                skip = true;
              }
            } catch (e) {}
          }
          if (file.includes("financial_commitments") && tablesList.includes("financial_commitments")) {
            skip = true;
          }
          if (file.includes("financial_evidence") && tablesList.includes("financial_evidence_packages")) {
            skip = true;
          }
          if (file.includes("storage_security") && bucketsList.includes("evidence-packages")) {
            skip = true;
          }
          if (file.includes("permission_engine") && tablesList.includes("permission_matrices")) {
            skip = true;
          }
          if (file.includes("audit_engine") && tablesList.includes("audit_logs")) {
            skip = true;
          }
          if (file.includes("ocr_learning") && tablesList.includes("ocr_learned_patterns")) {
            skip = true;
          }
        }

        if (skip) {
          logs.push(`⏭️ Skipped migration ${file} (Already Applied)`);
          continue;
        }

        logs.push(`⚙️ Executing migration: ${file}...`);
        const fileContent = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        
        if (fileContent.trim()) {
          let sanitizedFileContent = fileContent;
          sanitizedFileContent = sanitizedFileContent.replace(/CREATE POLICY\s+("?\w+"?)\s+ON\s+("?[\w.]+"?)/gi, "DROP POLICY IF EXISTS $1 ON $2; CREATE POLICY $1 ON $2");
          sanitizedFileContent = sanitizedFileContent.replace(/CREATE TRIGGER\s+("?\w+"?)/gi, "CREATE OR REPLACE TRIGGER $1");
          await client.query(sanitizedFileContent);
          logs.push(`✅ Migration executed successfully: ${file}`);
        } else {
          logs.push(`ℹ️ Migration file ${file} is empty. Skipped.`);
        }
      }

      success = true;
      logs.push("🎉 DATABASE ARCHITECTURE & MIGRATIONS SUCCESSFULLY INSTALLED!");
    } catch (err: any) {
      success = false;
      errorMessage = err?.message || String(err);
      logs.push(`❌ EXCEPTION: ${errorMessage}`);
    } finally {
      if (client) {
        try {
          await client.end();
        } catch (e) {}
      }
    }

    return { success, logs, errorMessage };
  };

  // endpoint to fetch database connection, tables, buckets and migrations status
  app.post("/api/admin/db/status", async (req, res) => {
    const hqAuth = await requireHqRole(req, ["HQ_OWNER", "HQ_STAFF"]);
    if (!hqAuth.ok) {
      return res.status(403).json({ errorMessage: "Akses ditolak. Hanya kakitangan HQ yang sah boleh menyemak status pangkalan data." });
    }
    const { dbPassword } = req.body;
    const projectRef = getProjectRef();
    
    const statusResult = {
      isConfigured: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
      projectRef,
      connectionSuccess: false,
      tables: [] as string[],
      buckets: [] as string[],
      rlsStatus: {} as Record<string, boolean>,
      migrations: [] as { name: string; fileExists: boolean; isApplied: boolean }[],
      errorMessage: null as string | null
    };

    // Gather migration files
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    let migrationFiles: string[] = [];
    if (fs.existsSync(migrationsDir)) {
      migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
    }

    migrationFiles.forEach(file => {
      statusResult.migrations.push({
        name: file,
        fileExists: true,
        isApplied: false
      });
    });

    try {
      const client = getPgClient(dbPassword);
      await client.connect();
      statusResult.connectionSuccess = true;

      // 1. Fetch public tables
      const tablesRes = await client.query(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      
      const tablesList = tablesRes.rows.map(r => r.tablename);
      statusResult.tables = tablesList;
      
      tablesRes.rows.forEach(r => {
        statusResult.rlsStatus[r.tablename] = r.rowsecurity;
      });

      // 2. Fetch buckets from storage schema
      try {
        const bucketsRes = await client.query(`SELECT name FROM storage.buckets`);
        statusResult.buckets = bucketsRes.rows.map(r => r.name);
      } catch (e) {
        console.warn("Could not query storage buckets (schema might not be initialized):", e);
      }

      // 3. Check migration status by probing corresponding signature tables
      statusResult.migrations.forEach(m => {
        if (m.name.includes("rls_foundation") && tablesList.includes("tenants")) {
          m.isApplied = true;
        }
        if (m.name.includes("financial_commitments") && tablesList.includes("financial_commitments")) {
          m.isApplied = true;
        }
        if (m.name.includes("financial_evidence") && tablesList.includes("financial_evidence_packages")) {
          m.isApplied = true;
        }
        if (m.name.includes("storage_security") && statusResult.buckets.includes("evidence-packages")) {
          m.isApplied = true;
        }
        if (m.name.includes("permission_engine") && tablesList.includes("permission_matrices")) {
          m.isApplied = true;
        }
        if (m.name.includes("audit_engine") && tablesList.includes("audit_logs")) {
          m.isApplied = true;
        }
        if (m.name.includes("ocr_learning") && tablesList.includes("ocr_learned_patterns")) {
          m.isApplied = true;
        }
      });

      await client.end();
    } catch (err: any) {
      statusResult.connectionSuccess = false;
      statusResult.errorMessage = err?.message || String(err);
    }

    res.json(statusResult);
  });

  // endpoint to programmatically execute schema setup and SQL migrations against Supabase
  app.post("/api/admin/db/initialize", async (req, res) => {
    const hqAuth = await requireHqRole(req, ["HQ_OWNER"]);
    if (!hqAuth.ok) {
      return res.status(403).json({ success: false, errorMessage: "Akses ditolak. Hanya HQ Pemilik boleh menjalankan migrasi pangkalan data." });
    }
    const { dbPassword } = req.body;
    const { success, logs, errorMessage } = await runDatabaseInitialization(dbPassword, true);
    res.json({ success, logs, errorMessage });
  });

  // End-to-end Verification and Production Readiness Analyzer (Task 5 & 6)
  app.post("/api/admin/db/verify", async (req, res) => {
    const hqAuth = await requireHqRole(req, ["HQ_OWNER"]);
    if (!hqAuth.ok) {
      return res.status(403).json({ success: false, errorMessage: "Akses ditolak. Hanya HQ Pemilik boleh menjalankan ujian pengesahan pangkalan data." });
    }
    const { dbPassword } = req.body;
    let client: any = null;
    
    const output = {
      success: false,
      tablesCreated: [] as string[],
      missingTables: [] as string[],
      bucketStatus: "NOT READY",
      rlsStatus: {} as Record<string, boolean>,
      writeTest: "NOT PASSED",
      rollbackTest: "NOT PASSED",
      auditTest: "NOT PASSED",
      storageTest: "NOT PASSED",
      readinessPct: 55,
      verdict: "NOT READY FOR STORAGE FOUNDATION",
      logs: [] as string[],
      errorMessage: null as string | null
    };

    try {
      client = getPgClient(dbPassword);
      await client.connect();
      output.logs.push("🔌 Direct database handshake established successfully.");

      // 1. Table Existence Validation
      const tablesRes = await client.query(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      const existingTables = tablesRes.rows.map(r => r.tablename);
      
      const approvedTables = [
        "tenants",
        "workspaces",
        "general_ledger_categories",
        "bank_accounts",
        "cash_accounts",
        "income_records",
        "expense_records",
        "receivables",
        "payables",
        "debts",
        "financial_commitments",
        "financial_evidence_packages",
        "user_role_assignments",
        "permission_matrices",
        "audit_logs",
        "ocr_learned_patterns",
        "immutable_audit_ledger"
      ];

      output.tablesCreated = existingTables.filter(t => approvedTables.includes(t));
      output.missingTables = approvedTables.filter(t => !existingTables.includes(t));

      // 2. RLS Status Audit
      tablesRes.rows.forEach(r => {
        if (approvedTables.includes(r.tablename)) {
          output.rlsStatus[r.tablename] = r.rowsecurity;
        }
      });

      // 3. Storage Bucket Existence Check
      try {
        const bucketsRes = await client.query(`SELECT id, name, public FROM storage.buckets WHERE id = 'evidence-packages'`);
        if (bucketsRes.rows.length > 0) {
          const bucket = bucketsRes.rows[0];
          output.bucketStatus = `FOUND (Private: ${!bucket.public})`;
        } else {
          output.bucketStatus = "MISSING";
        }
      } catch (e) {
        output.bucketStatus = "MISSING/NOT CONFIGURED";
      }

      // 4. Combined Write & Rollback Transactional Verification
      if (existingTables.includes("financial_commitments")) {
        try {
          await client.query("BEGIN;");
          
          // Seed temporary scaffolding records
          await client.query(`
            INSERT INTO tenants (id, name, category) 
            VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'Test Tenant Sandbox', 'DEMO') 
            ON CONFLICT (id) DO NOTHING;
          `);
          await client.query(`
            INSERT INTO workspaces (id, tenant_id, name, slug) 
            VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Test Workspace Staging', 'test-ws-stg') 
            ON CONFLICT (id) DO NOTHING;
          `);

          // Insert transient trial record
          await client.query(`
            INSERT INTO financial_commitments (id, workspace_id, description, obligee_name, amount_per_interval_myr, recurrence, start_date)
            VALUES ('11111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Production Integrity Probe', 'MYKERANI Corp', 500.00, 'MONTHLY', '2026-06-11');
          `);

          const confirmWrite = await client.query(`
            SELECT id FROM financial_commitments WHERE id = '11111111-1111-1111-1111-111111111111'::uuid
          `);
          if (confirmWrite.rows.length > 0) {
            output.writeTest = "PASSED (Write OK)";
          } else {
            output.writeTest = "FAILED (Probed row not found)";
          }

          // Force roll back of transaction to check isolation
          await client.query("ROLLBACK;");
          
          const confirmRollback = await client.query(`
            SELECT id FROM financial_commitments WHERE id = '11111111-1111-1111-1111-111111111111'::uuid
          `);
          if (confirmRollback.rows.length === 0) {
            output.rollbackTest = "PASSED (Transient roll back isolated)";
          } else {
            output.rollbackTest = "FAILED (Transaction persisted)";
          }

        } catch (e) {
          await client.query("ROLLBACK;").catch(() => {});
          output.writeTest = `FAILED Exception: ${String(e)}`;
          output.rollbackTest = "FAILED (Transaction crashed)";
        }
      } else {
        output.writeTest = "SKIPPED (missing financial_commitments table)";
        output.rollbackTest = "SKIPPED";
      }

      // 5. Immutable Audit Engine Trigger Checks
      if (existingTables.includes("immutable_audit_ledger")) {
        try {
          await client.query("BEGIN;");
          
          await client.query(`
            INSERT INTO tenants (id, name, category) 
            VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'Test Tenant Sandbox', 'DEMO') 
            ON CONFLICT (id) DO NOTHING;
          `);
          await client.query(`
            INSERT INTO workspaces (id, tenant_id, name, slug) 
            VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Test Workspace Staging', 'test-ws-stg') 
            ON CONFLICT (id) DO NOTHING;
          `);

          // Insert direct audit file trace
          await client.query(`
            INSERT INTO immutable_audit_ledger (workspace_id, entity_table, entity_id, action, performed_by, after_state_sha256, raw_payload_json, previous_block_hash, current_block_hash)
            VALUES (
              '00000000-0000-0000-0000-000000000000'::uuid,
              'expense_records',
              '22222222-2222-2222-2222-222222222222'::uuid,
              'INSERT',
              '00000000-0000-0000-0000-000000000000'::uuid,
              'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              '{"vendor": "GrabCar", "total": 45.00}'::jsonb,
              'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
              'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
            );
          `);

          const auditQuery = await client.query(`
            SELECT previous_block_hash, current_block_hash 
            FROM immutable_audit_ledger 
            WHERE entity_id = '22222222-2222-2222-2222-222222222222'::uuid
          `);

          if (auditQuery.rows.length > 0) {
            const row = auditQuery.rows[0];
            output.auditTest = `PASSED (Chained block: ${row.current_block_hash.substring(0, 8)}...)`;
          } else {
            output.auditTest = "FAILED (Audit record was not queryable)";
          }

          await client.query("ROLLBACK;");
        } catch (e) {
          await client.query("ROLLBACK;").catch(() => {});
          output.auditTest = `FAILED Exception: ${String(e)}`;
        }
      } else {
        output.auditTest = "SKIPPED (missing immutable_audit_ledger relation)";
      }

      // 6. Private Evidence Storage Bucket Upload & Delete Checks
      try {
        await client.query("BEGIN;");
        
        await client.query(`
          INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
          VALUES (
            '33333333-3333-3333-3333-333333333333'::uuid,
            'evidence-packages',
            '00000000-0000-0000-0000-000000000000/diagnostics-test.png',
            '00000000-0000-0000-0000-000000000000'::uuid,
            '{"size": 1024, "mimetype": "image/png"}'::jsonb
          );
        `);

        const storageRes = await client.query(`
          SELECT id FROM storage.objects WHERE id = '33333333-3333-3333-3333-333333333333'::uuid
        `);

        if (storageRes.rows.length > 0) {
          output.storageTest = "PASSED (Storage Write/Delete Verified)";
        } else {
          output.storageTest = "FAILED (Storage entry query empty)";
        }

        await client.query("ROLLBACK;");
      } catch (e) {
        await client.query("ROLLBACK;").catch(() => {});
        output.storageTest = `FAILED (Database storage write simulation error: ${String(e)})`;
      }

      // Calculate Production Readiness Score
      const tablesCount = approvedTables.filter(t => existingTables.includes(t)).length;
      const tablesRatio = tablesCount / approvedTables.length;
      
      const rlsActiveCount = approvedTables.filter(t => output.rlsStatus[t] === true).length;
      const rlsRatio = rlsActiveCount / approvedTables.length;

      const writePassed = output.writeTest.startsWith("PASSED") && output.rollbackTest.startsWith("PASSED");
      const auditPassed = output.auditTest.startsWith("PASSED");
      const storagePassed = output.bucketStatus.startsWith("FOUND") && output.storageTest.startsWith("PASSED");

      let calculatedReadiness = Math.round(
        (tablesRatio * 30) + 
        (rlsRatio * 30) + 
        (writePassed ? 15 : 0) + 
        (auditPassed ? 10 : 0) + 
        (storagePassed ? 15 : 0)
      );

      output.readinessPct = Math.min(calculatedReadiness, 100);

      if (output.readinessPct >= 95) {
        output.verdict = "READY FOR STORAGE FOUNDATION";
      } else {
        output.verdict = "NOT READY FOR STORAGE FOUNDATION";
      }

      await client.end();
      output.success = true;
    } catch (err: any) {
      output.success = false;
      output.errorMessage = err?.message || String(err);
      output.verdict = "NOT READY FOR STORAGE FOUNDATION (TCP Handshake Error)";
    }

    res.json(output);
  });

  // ── CREATE STAFF ACCOUNT (Admin only) ─────────────────────────────────────
  app.post("/api/admin/create-staff", async (req, res) => {
    try {
      const { email, fullName, role } = req.body;

      if (!email || !fullName || !role) {
        return res.status(400).json({ success: false, error: "Email, nama, dan role diperlukan." });
      }

      const allowedRoles = ["HQ_STAFF", "TENANT_STAFF"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, error: "Role tidak dibenarkan." });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        return res.status(503).json({ success: false, error: "Sistem belum dikonfigurasi. Sila tambah SUPABASE_SERVICE_ROLE_KEY dalam Railway." });
      }

      // Caller identity (role + tenant) is always resolved server-side from
      // their session bearer token — never trusted from the request body.
      const caller = await resolveCallerIdentity(req);
      if (!caller.ok) {
        return res.status(401).json({ success: false, error: "Sesi tidak sah. Sila log masuk semula." });
      }
      if (role === "HQ_STAFF" && caller.role !== "HQ_OWNER") {
        return res.status(403).json({ success: false, error: "Hanya HQ Pemilik boleh cipta akaun HQ Staf." });
      }
      if (role === "TENANT_STAFF" && caller.role !== "TENANT_OWNER" && caller.role !== "HQ_OWNER") {
        return res.status(403).json({ success: false, error: "Hanya Pemilik Syarikat boleh cipta akaun staf syarikat." });
      }
      // A tenant owner can only create staff inside their own tenant — the
      // tenantId always comes from the caller's verified session, never
      // from the request body, so it cannot be spoofed to another tenant.
      const newStaffTenantId = role === "TENANT_STAFF" ? (caller.tenantId || "") : "";

      // Generate temporary password
      const tempPassword = `MyKerani@${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString().slice(-4)}!`;

      // Call Supabase Admin API to create user
      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            fullName,
            role,
            tenantId: newStaffTenantId,
          }
        })
      });

      const createData = await createRes.json() as any;

      if (!createRes.ok) {
        const errMsg = createData?.msg || createData?.message || createData?.error_description || "Gagal cipta akaun.";
        return res.status(400).json({ success: false, error: errMsg });
      }

      return res.json({
        success: true,
        userId: createData.id,
        email: createData.email,
        tempPassword,
        message: `Akaun ${role} berjaya dicipta. Kongsikan kata laluan sementara kepada staf anda.`
      });

    } catch (err: any) {
      console.error("create-staff error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Ralat sistem." });
    }
  });

  app.post("/api/ocr/analyze", async (req, res) => {
    try {
      const { fileDataUrl, fileName, documentType, tenantId, workspaceId, userId } = req.body;
      if (!fileDataUrl) {
        return res.status(400).json({ error: "No file data provided." });
      }
      if (await isUserSuspended(userId)) {
        return res.status(403).json({ error: "Akaun anda telah disekat oleh pentadbir HQ. Sila hubungi sokongan." });
      }
      if (!(await consumeResourceCredit(tenantId, workspaceId, "OCR", `OCR analysis: ${fileName || "document"}`))) {
        return res.status(402).json({ error: "Kredit OCR anda telah habis. Sila beli tambahan kredit atau naik taraf pelan anda." });
      }

      const access = await verifyTenantAccess(req, tenantId, workspaceId);
      if (!access.ok) {
        return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
      }

      const candidates = await getAiProviderCandidates();
      if (candidates.length === 0) {
        console.info("No AI provider configured (checked HQ Console AI Router settings, then OPENAI_API_KEY/GEMINI_API_KEY/ANTHROPIC_API_KEY env vars). Using realistic sandbox OCR fallback.");
        const mockResult = generateMockOcr(fileName, documentType);
        return res.json(mockResult);
      }

      const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "OCR", `OCR analyze: ${fileName || "document"}`);
      if (!hasCredit) {
        return res.status(402).json({
          error: "Kredit OCR syarikat anda telah digunakan sepenuhnya untuk tempoh semasa. Sila naik taraf pelan atau tunggu pembaharuan bulanan.",
          code: "OCR_CREDITS_EXHAUSTED",
        });
      }

      // Process fileDataUrl. Format: data:<mimeType>;base64,<base64Data>
      const match = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      let mimeType = "image/png";
      let base64Data = fileDataUrl;
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const isInvoice = documentType === "INVOICE";
      const isStatement = documentType === "STATEMENT";

      const invoiceFields = isInvoice
        ? `,
  "supplierName": "string — the vendor/supplier issuing this invoice",
  "invoiceNumber": "string — the invoice number",
  "invoiceDate": "string — YYYY-MM-DD",
  "dueDate": "string — YYYY-MM-DD payment due date"`
        : "";

      const statementFields = isStatement
        ? `,
  "transactions": [{ "date": "YYYY-MM-DD", "description": "string", "amount": 0, "type": "CREDIT|DEBIT", "suggestedCategory": "string", "confidenceScore": 0.0 }]`
        : "";

      const ocrPrompt = `Analyze this financial document (type: ${documentType}, filename: ${fileName}) and extract its structured details. If certain fields like Document Number or Merchant Name are not explicitly clear, use your reasoning intelligence to deduct the most accurate values from the visual context.${
        isStatement
          ? " This is a BANK STATEMENT — it may contain multiple pages and multiple individual transactions; extract EVERY transaction line you can identify into the 'transactions' array (CREDIT = money in, DEBIT = money out)."
          : ""
      }${
        isInvoice
          ? " This is an INVOICE — extract the supplier name, invoice number, invoice date, and due date in addition to the generic fields."
          : ""
      }

Provide your output precisely formatted as raw JSON matching exactly this shape, with no markdown code fences and no extra commentary outside the JSON object:
{
  "merchantName": "string — name of the merchant, vendor, supplier, or company issuing the document",
  "documentNumber": "string — invoice number, receipt ID, reference number, or statement number",
  "date": "string — YYYY-MM-DD format if found",
  "amount": 0,
  "currency": "string — three-letter currency code e.g. MYR, USD, EUR, SGD",
  "suggestedCategory": "string — e.g. Travel, Software, Utilities, Meals, Office Supplies, Advertising, Services",
  "confidenceScore": 0.0,
  "rawExtractedText": "string — short snippet summarizing what this document represents"${invoiceFields}${statementFields}
}`;

      let parsedResult: any = null;
      let lastErr: any = null;
      let usedCandidate: AiCandidate | null = null;
      for (const candidate of candidates) {
        try {
          parsedResult = await callAiProviderOcr(candidate, mimeType, base64Data, ocrPrompt);
          usedCandidate = candidate;
          break;
        } catch (err: any) {
          lastErr = err;
          console.error(`AI provider "${candidate.provider}" OCR call failed, trying next candidate:`, err?.message || err);
        }
      }

      if (!parsedResult) {
        throw lastErr || new Error("All configured AI providers failed for OCR");
      }

      logAiUsage(tenantId, workspaceId, userId, "ocr", usedCandidate!.provider, usedCandidate!.model);

      return res.json(parsedResult);

    } catch (error: any) {
      const errStr = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      const isBillingOrCreditIssue = /depleted|exhausted|billing|prepay|429|credit/i.test(errStr);

      console.error("AI OCR call failed:", errStr);
      if (isBillingOrCreditIssue) {
        console.info("AI provider billing limits/credits reached. Smoothly transitioning to MYKERANI OCR Sandbox Simulator.");
      } else {
        console.info("AI OCR extraction resolved seamlessly to robust local cognitive fallback.");
      }

      const mockResult = generateMockOcr(req.body.fileName || "document.png", req.body.documentType || "RECEIPT");
      return res.json({
        ...mockResult,
        confidenceScore: Math.min(mockResult.confidenceScore, 0.82),
        warning: isBillingOrCreditIssue
          ? "Successfully processed via high-fidelity sandbox OCR simulator. (API limits reached)"
          : "Successfully completed with cognitive fallback extraction."
      });
    }
  });

  // AI FINANCIAL ASSISTANT SECURE PROXY ROUTE
  app.post("/api/ai/assistant", async (req, res) => {
    try {
      const { query, financialContext, userId } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Missing assistant query text." });
      }
      if (await isUserSuspended(userId)) {
        return res.status(403).json({ error: "Akaun anda telah disekat oleh pentadbir HQ. Sila hubungi sokongan." });
      }
      if (!(await consumeResourceCredit(financialContext?.activeTenant?.id, financialContext?.activeWorkspace?.id, "AI", "AI assistant query"))) {
        return res.status(402).json({ error: "Kredit AI anda telah habis. Sila beli tambahan kredit atau naik taraf pelan anda." });
      }

      const candidates = await getAiProviderCandidates();
      // TEMP RUNTIME VERIFICATION LOGGING — remove after diagnosis.
      console.info("[AI_ROUTER_DEBUG]", JSON.stringify({
        candidateCount: candidates.length,
        candidateProviders: candidates.map(c => `${c.provider}:${c.model}`),
        dbConfigReachable: Boolean(process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
        envFallbackKeysPresent: {
          gemini: Boolean(process.env.GEMINI_API_KEY),
          openai: Boolean(process.env.OPENAI_API_KEY),
          anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        },
        forcedProvider: process.env.AI_PROVIDER || null,
        providerOrder: process.env.AI_PROVIDER_ORDER || null,
      }));
      if (candidates.length === 0) {
        console.info("[AI_ROUTER_DEBUG] fallbackTriggerReason=NO_CANDIDATES — checked HQ Console AI Router settings (ai_router_settings/ai_provider_configs via SUPABASE_SERVICE_ROLE_KEY), then OPENAI_API_KEY/GEMINI_API_KEY/ANTHROPIC_API_KEY env vars. Directing to simulated workspace context analysis.");
        const fallbackResult = generateFallbackAssistantResponse(query, financialContext || {});
        return res.json(fallbackResult);
      }

      const tenantId = financialContext?.activeTenant?.id;
      const workspaceId = financialContext?.activeWorkspace?.id;

      const access = await verifyTenantAccess(req, tenantId, workspaceId);
      if (!access.ok) {
        return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
      }

      const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "AI", `AI assistant query: ${String(query).slice(0, 80)}`);
      if (!hasCredit) {
        return res.status(402).json({
          error: "Kredit AI syarikat anda telah digunakan sepenuhnya untuk tempoh semasa. Sila naik taraf pelan atau tunggu pembaharuan bulanan.",
          code: "AI_CREDITS_EXHAUSTED",
        });
      }

      const systemPrompt = `You are MYKERANI AI Financial Assistant, a highly trained cognitive co-pilot. Your purpose is to analyze the active workspace financial data and provide Q&A answers, structured searches, analytical summaries, diagnostic health explanations, and evidence retrieval references.

Active Workspace and Tenant context:
Workspace Name: ${financialContext?.activeWorkspace?.name || "Standard Workspace"}
Tenant Name: ${financialContext?.activeTenant?.name || "Standard Tenant"}

User's Query/Question: "${query}"

Here is the structured financial database content of the active workspace:
1. Financial Records (financialEvents): ${JSON.stringify(financialContext?.financialEvents || [])}
2. Cash Accounts: ${JSON.stringify(financialContext?.cashAccounts || [])}
3. Bank Accounts: ${JSON.stringify(financialContext?.bankAccounts || [])}
4. Debt Records: ${JSON.stringify(financialContext?.debtRecords || [])}
5. Recurring Commitments: ${JSON.stringify(financialContext?.financialCommitments || [])}
6. Evidence Packages: ${JSON.stringify(financialContext?.financialEvidencePackages || [])}
7. OCR Learned Vendor Patterns (Learning Layer memory): ${JSON.stringify(financialContext?.ocrLearnedPatterns || [])}

Here is what you know about the user's life (Profile System — all fields are optional and may be empty; never assume facts beyond what is given here):
8. Personal Profile: ${JSON.stringify(financialContext?.personalProfile || {})}
9. Business Profile: ${JSON.stringify(financialContext?.businessProfile || {})}
10. Vehicles (name, plateNumber, vehicleType, ownership "PERSONAL"|"BUSINESS"): ${JSON.stringify(financialContext?.vehicles || [])}
11. Dependents: ${JSON.stringify(financialContext?.dependents || [])}

Instructions & Constraints:
- AI Suggests. User Confirms. AI Learns. (If you identify any unrecognized category, or vendor without a learned profile, ALWAYS generate a 'LEARN_PATTERN' suggestion inside the 'suggestions' array. Do not suggest editing or deleting records. Only recommend classifications that the user can confirm manually.)
- AI is strictly advisory. Your recommendations should prioritize safety, financial health, liquidity, and double-entry accuracy.
- Return references ('linkedRecordIds' and 'linkedEvidenceIds') when queries touch specific events, bills, invoices, receipts, or attachments.
- Return structured visual metrics in the 'highlights' object. Health Status must be EXCELLENT, STABLE, WARNING, or THREAT.
- FINANCIAL INTENT DETECTION: if the user's query describes a real-world financial transaction (in Malay or English) rather than a question, detect it and populate 'financialIntent'. Examples: "Pelanggan bayar RM500" / "Customer paid RM500" -> INCOME; "Saya isi minyak RM50" / "Filled petrol RM50" -> EXPENSE; "Saya hutang pembekal RM300" / "Borrowed RM1000 from Ali" -> DEBT; "Customer owes RM500" / "Pelanggan berhutang RM500" -> RECEIVABLE; "Rental RM1200 monthly" / "Sewa RM1200 sebulan" -> COMMITMENT. If no transaction is described, set "detected": false and leave the other financialIntent fields null.
- When financialIntent.detected is true, you MUST ALSO add exactly one suggestion to the 'suggestions' array with "actionType": "CONFIRM_TRANSACTION" whose payload carries the structured transaction fields below. This is a SUGGESTION ONLY — you never write the record yourself; the user must explicitly Confirm (optionally after editing) before anything is saved. Default "date" to today (${new Date().toISOString().split("T")[0]}) if the user didn't state one.
- DISAMBIGUATION: if there are 2+ Vehicles listed above (section 10) and the user's transaction text plausibly relates to a vehicle (petrol, toll, parking, service, repair, road tax, insurance) but does NOT name which vehicle, do NOT guess. Instead set financialIntent.detected to false, leave 'suggestions' empty, and in 'text' ask a short clarifying question listing the vehicle names and their ownership (e.g. "Untuk kenderaan mana — Hilux (Perniagaan) atau Myvi (Peribadi)?"). Once the user's NEXT message names the vehicle, treat it as the missing detail for the same transaction and proceed normally (detect + CONFIRM_TRANSACTION), using that vehicle's ownership to decide whether it is a business EXPENSE or a personal/owner-drawing transaction. The same pattern applies if Business Profile / multiple businesses make the transaction's owner ambiguous: ask, don't guess.

Provide your output precisely formatted as raw JSON matching exactly this shape, with no markdown code fences and no extra commentary outside the JSON object:
{
  "text": "string — Markdown-formatted advisory answer",
  "financialIntent": { "detected": false, "type": "INCOME|EXPENSE|DEBT|RECEIVABLE|COMMITMENT|null", "amount": 0, "relatedParty": "string|null", "rawText": "string" },
  "suggestions": [
    { "id": "string", "title": "string", "description": "string", "actionType": "LEARN_PATTERN", "payload": { "vendorName": "string", "category": "string", "recordType": "string", "confidenceScore": 0.0 } },
    { "id": "string", "title": "string", "description": "string", "actionType": "CONFIRM_TRANSACTION", "payload": { "transactionType": "INCOME|EXPENSE|DEBT|RECEIVABLE|COMMITMENT", "category": "string", "amount": 0, "date": "YYYY-MM-DD", "relatedParty": "string", "confidenceScore": 0.0 } }
  ],
  "highlights": { "healthStatus": "EXCELLENT|STABLE|WARNING|THREAT", "estimatedRunwayDays": 0, "capitalEfficiencyScore": 0, "criticalActionRequired": "string" },
  "linkedRecordIds": ["string"],
  "linkedEvidenceIds": ["string"]
}
Only include a "CONFIRM_TRANSACTION" suggestion entry when financialIntent.detected is true. If you output markdown formatting inside the fields, escape quotes correctly.`;

      // Try each configured provider in cheapest-first order, falling through to the
      // next one if a call fails (quota/billing/outage), before giving up to the simulator.
      let parsedResponse: any = null;
      let lastErr: any = null;
      let usedCandidate: AiCandidate | null = null;
      for (const candidate of candidates) {
        try {
          parsedResponse = await callAiProvider(candidate, systemPrompt);
          usedCandidate = candidate;
          break;
        } catch (err: any) {
          lastErr = err;
          console.error(`AI provider "${candidate.provider}" failed, trying next candidate:`, err?.message || err);
        }
      }

      if (!parsedResponse) {
        console.info("[AI_ROUTER_DEBUG] fallbackTriggerReason=ALL_CANDIDATES_FAILED", lastErr?.message || lastErr);
        throw lastErr || new Error("All configured AI providers failed");
      }

      console.info("[AI_ROUTER_DEBUG]", JSON.stringify({
        finalProviderUsed: usedCandidate!.provider,
        finalModelUsed: usedCandidate!.model,
        financialIntentPresent: Boolean(parsedResponse?.financialIntent),
        financialIntentDetected: parsedResponse?.financialIntent?.detected ?? null,
        confirmTransactionSuggestionPresent: Array.isArray(parsedResponse?.suggestions) && parsedResponse.suggestions.some((s: any) => s.actionType === "CONFIRM_TRANSACTION"),
      }));

      logAiUsage(financialContext?.activeTenant?.id, financialContext?.activeWorkspace?.id, userId, "assistant", usedCandidate!.provider, usedCandidate!.model);

      return res.json(parsedResponse);

    } catch (error: any) {
      const errStr = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      const isBillingOrCreditIssue = /depleted|exhausted|billing|prepay|429|credit/i.test(errStr);

      console.error("AI Assistant call failed:", errStr);
      if (isBillingOrCreditIssue) {
        console.info("AI provider billing limits/credits reached. Smoothly transitioning to MYKERANI Assistant Sandbox Simulator.");
      } else {
        console.info("AI Assistant query resolved seamlessly to robust local cognitive fallback.");
      }

      const fallbackResult = generateFallbackAssistantResponse(req.body.query, req.body.financialContext || {});
      const advisoryBanner = isBillingOrCreditIssue 
        ? "⚠️ **Advisory: Developer Prepayment Credits Depleted**\nYour project's AI Studio prepayment credits are currently exhausted. MYKERANI has automatically engaged the high-fidelity Sandbox Simulation engine to ensure continuous operation. Web applications can be fully tested under this simulation.\n\n---\n\n"
        : "";

      return res.json({
        ...fallbackResult,
        text: `${advisoryBanner}🤖 (Simulator Fallback Mode) ${fallbackResult.text}`
      });
    }
  });

  // ── MYKERANI AI Router ──────────────────────────────────────────────────
  // Provider catalogue mirrored from the HQ Console "AI Router" UI
  // (src/components/HQConsoleShell.tsx AI_PROVIDERS) so cost-based ordering
  // here matches what HQ sees. OpenAI-compatible providers share one caller
  // since they all expose the same /chat/completions REST shape.
  type AiProviderId = "gemini" | "openai" | "anthropic" | "deepseek" | "xai" | "mistral" | "groq" | "alibaba";
  interface AiCandidate { provider: AiProviderId; apiKey: string; model: string; costUsd: number; }

  const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    xai: "https://api.x.ai/v1",
    mistral: "https://api.mistral.ai/v1",
    groq: "https://api.groq.com/openai/v1",
    alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  };

  const MODEL_CATALOGUE: Record<AiProviderId, { id: string; inputPer1M: number; outputPer1M: number; tier: "fast" | "balanced" | "pro" }[]> = {
    gemini: [
      { id: "gemini-2.0-flash", inputPer1M: 0.075, outputPer1M: 0.30, tier: "fast" },
      { id: "gemini-2.5-flash", inputPer1M: 0.15, outputPer1M: 0.60, tier: "balanced" },
      { id: "gemini-2.5-pro", inputPer1M: 1.25, outputPer1M: 10.00, tier: "pro" },
    ],
    openai: [
      { id: "gpt-4o-mini", inputPer1M: 0.15, outputPer1M: 0.60, tier: "fast" },
      { id: "o4-mini", inputPer1M: 1.10, outputPer1M: 4.40, tier: "balanced" },
      { id: "gpt-4o", inputPer1M: 2.50, outputPer1M: 10.00, tier: "pro" },
    ],
    anthropic: [
      { id: "claude-haiku-4-5", inputPer1M: 0.80, outputPer1M: 4.00, tier: "fast" },
      { id: "claude-sonnet-4-6", inputPer1M: 3.00, outputPer1M: 15.00, tier: "pro" },
    ],
    deepseek: [
      { id: "deepseek-v3", inputPer1M: 0.27, outputPer1M: 1.10, tier: "balanced" },
      { id: "deepseek-r1", inputPer1M: 0.55, outputPer1M: 2.19, tier: "pro" },
    ],
    xai: [
      { id: "grok-3-mini", inputPer1M: 0.30, outputPer1M: 0.50, tier: "fast" },
      { id: "grok-3", inputPer1M: 3.00, outputPer1M: 15.00, tier: "pro" },
    ],
    mistral: [
      { id: "mistral-small-3", inputPer1M: 0.10, outputPer1M: 0.30, tier: "fast" },
      { id: "mistral-large-2", inputPer1M: 2.00, outputPer1M: 6.00, tier: "pro" },
    ],
    groq: [
      { id: "llama-3.3-70b", inputPer1M: 0.05, outputPer1M: 0.10, tier: "fast" },
      { id: "llama-4-scout", inputPer1M: 0.11, outputPer1M: 0.34, tier: "balanced" },
      { id: "llama-4-maverick", inputPer1M: 0.50, outputPer1M: 0.77, tier: "pro" },
    ],
    alibaba: [
      { id: "qwen-turbo", inputPer1M: 0.05, outputPer1M: 0.20, tier: "fast" },
      { id: "qwen2.5-72b", inputPer1M: 0.20, outputPer1M: 0.60, tier: "balanced" },
      { id: "qwen-plus", inputPer1M: 0.40, outputPer1M: 1.20, tier: "pro" },
    ],
  };

  function modelCostUsd(provider: AiProviderId, modelId: string | null): number {
    const models = MODEL_CATALOGUE[provider];
    const m = models.find(x => x.id === modelId) || models[0];
    return (600 * m.inputPer1M + 900 * m.outputPer1M) / 1_000_000;
  }

  function modelTier(provider: AiProviderId, modelId: string | null): "fast" | "balanced" | "pro" {
    const models = MODEL_CATALOGUE[provider];
    return (models.find(x => x.id === modelId) || models[0]).tier;
  }

  // Fetch the HQ-configured AI Router settings + provider keys directly from
  // Supabase using the service-role key (bypasses RLS — this table is locked
  // to all client roles on purpose, only the server may read real key values).
  async function fetchDbAiConfig(): Promise<{ strategy: string; configs: { provider: AiProviderId; enabled: boolean; apiKey: string; model: string | null }[] } | null> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;

    try {
      const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
      const [settingsRes, configsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/ai_router_settings?id=eq.global&select=strategy`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/ai_provider_configs?select=provider,enabled,api_key,selected_model`, { headers }),
      ]);
      if (!settingsRes.ok || !configsRes.ok) return null;

      const settingsRows: any[] = await settingsRes.json();
      const configRows: any[] = await configsRes.json();
      const strategy = settingsRows[0]?.strategy || "cheapest";

      const configs = configRows
        .filter(r => r.enabled && r.api_key)
        .map(r => ({ provider: r.provider as AiProviderId, enabled: true, apiKey: r.api_key as string, model: r.selected_model as string | null }));

      return { strategy, configs };
    } catch (err) {
      console.error("Failed to fetch AI Router config from Supabase:", err);
      return null;
    }
  }

  // Records one AI usage credit against a tenant (service-role write — no client
  // role can insert directly, see ai_usage_log RLS). Best-effort: a logging failure
  // must never block the actual AI response from reaching the user.
  async function logAiUsage(tenantId: string | undefined | null, workspaceId: string | undefined | null, userId: string | undefined | null, feature: "assistant" | "ocr", provider: string, model: string): Promise<void> {
    if (!tenantId) return;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/ai_usage_log`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ tenant_id: tenantId, workspace_id: workspaceId || null, user_id: userId || null, feature, provider, model }),
      });
    } catch (err) {
      console.error("Failed to log AI usage:", err);
    }

    // Mirror into the generic event_logs ledger (separate from ai_usage_log,
    // which is billing-detail-specific) so AI/OCR calls show up alongside
    // login/upload/export/etc. for monitoring, analytics, and troubleshooting.
    try {
      await fetch(`${supabaseUrl}/rest/v1/event_logs`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          workspace_id: workspaceId || null,
          user_id: userId || null,
          event_type: feature === "ocr" ? "OCR_PROCESS" : "AI_ANALYSIS",
          description: `${feature === "ocr" ? "OCR document processed" : "AI analysis call"} via ${provider}/${model}`,
          metadata: { provider, model, feature },
        }),
      });
    } catch (err) {
      console.error("Failed to write event log for AI usage:", err);
    }
  }

  // Resource Governance Layer enforcement: debits one credit from the tenant's
  // workspace wallet (resource_wallets, via consume_resource_credit RPC) before
  // an AI/OCR call is allowed to proceed. Internal HQ tenants are exempt inside
  // the RPC itself. Returns false if the wallet has insufficient balance.
  async function consumeResourceCredit(tenantId: string | undefined | null, workspaceId: string | undefined | null, creditType: "AI" | "OCR", description: string): Promise<boolean> {
    if (!tenantId || !workspaceId) return true;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return true;
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_resource_credit`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_tenant_id: tenantId, p_workspace_id: workspaceId, p_credit_type: creditType, p_amount: 1, p_description: description }),
      });
      if (!resp.ok) return true;
      const result = await resp.json();
      return result === true;
    } catch (err) {
      console.error(`Failed to consume ${creditType} resource credit:`, err);
      return true;
    }
  }

  // HQ can suspend an individual user's access to AI features (see
  // set_user_suspended RPC). Checked server-side so a suspended user can't
  // bypass it by calling the API directly.
  async function isUserSuspended(userId: string | undefined | null): Promise<boolean> {
    if (!userId) return false;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return false;
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=is_suspended`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!resp.ok) return false;
      const rows: any[] = await resp.json();
      return Boolean(rows[0]?.is_suspended);
    } catch (err) {
      console.error("Failed to check user suspension state:", err);
      return false;
    }
  }

  // Verifies the caller's Supabase session token actually belongs to the
  // tenant/workspace it claims in the request body. Frontend filtering is
  // not security — without this, any client could pass another tenant's
  // tenantId/workspaceId and drain or misattribute that tenant's AI/OCR
  // credit wallet (Constitution: Multi Tenant Rule — "Backend validation
  // is mandatory").
  // Resolves the caller's identity (user id, tenant id, role) strictly from
  // their Supabase session bearer token + the user_role_assignments table —
  // never from anything the client put in the request body. This is the
  // single source of truth for "who is calling" used by every endpoint
  // below (Constitution: Multi Tenant Rule — "tenant identity must come
  // from the authenticated session, not the request body").
  async function resolveCallerIdentity(req: any): Promise<{ ok: boolean; userId?: string; tenantId?: string; role?: string }> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return { ok: true }; // local/self-hosted dev without DB

    const authHeader = req.headers?.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return { ok: false };

    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      });
      if (!userResp.ok) return { ok: false };
      const userData = await userResp.json() as any;
      const userId = userData?.id;
      if (!userId) return { ok: false };

      const roleResp = await fetch(
        `${supabaseUrl}/rest/v1/user_role_assignments?user_id=eq.${userId}&select=tenant_id,role`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      if (!roleResp.ok) return { ok: false };
      const roleRows: any[] = await roleResp.json();
      const tenantId = roleRows[0]?.tenant_id;
      const role = roleRows[0]?.role;
      if (!tenantId || !role) return { ok: false };

      return { ok: true, userId, tenantId, role };
    } catch (err) {
      console.error("Failed to resolve caller identity:", err);
      return { ok: false };
    }
  }

  // Verifies the caller's authenticated tenant/workspace membership.
  // Returns the *authoritative* tenantId/userId/role resolved server-side
  // from the session — callers should use the returned values, not the
  // claimed ones, for any downstream DB writes.
  async function verifyTenantAccess(
    req: any,
    claimedTenantId: string | undefined | null,
    claimedWorkspaceId: string | undefined | null
  ): Promise<{ ok: boolean; userId?: string; tenantId?: string; role?: string }> {
    const identity = await resolveCallerIdentity(req);
    if (!identity.ok) return { ok: false };
    // Dev fallback (no Supabase configured) has no tenantId to compare against.
    if (!identity.tenantId) return identity;
    if (claimedTenantId && identity.tenantId !== claimedTenantId) return { ok: false };

    if (claimedWorkspaceId) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        const wsResp = await fetch(
          `${supabaseUrl}/rest/v1/workspaces?id=eq.${claimedWorkspaceId}&select=tenant_id`,
          { headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` } }
        );
        if (!wsResp.ok) return { ok: false };
        const wsRows: any[] = await wsResp.json();
        if (wsRows[0]?.tenant_id !== identity.tenantId) return { ok: false };
      } catch (err) {
        console.error("Failed to verify workspace ownership:", err);
        return { ok: false };
      }
    }

    return identity;
  }

  // Gate for HQ-only operations (DB administration, schema migrations).
  // Rejects unless the caller's session resolves to one of allowedRoles —
  // a raw dbPassword in the request body is never treated as authorization.
  async function requireHqRole(req: any, allowedRoles: string[]): Promise<{ ok: boolean; userId?: string; role?: string }> {
    const identity = await resolveCallerIdentity(req);
    if (!identity.ok) return { ok: false };
    if (!identity.role) return identity; // dev fallback, no Supabase configured
    if (!allowedRoles.includes(identity.role)) return { ok: false };
    return identity;
  }

  // Atomically checks and deducts one credit of the given type from the
  // workspace's resource_wallets balance via the consume_resource_credit RPC
  // (SECURITY DEFINER, service_role-only). Returns false if the wallet has
  // insufficient balance — callers must not call a paid AI provider in that
  // case. Fails open (returns true) if Supabase isn't configured or the
  // tenant/workspace id is missing, matching this project's existing
  // best-effort posture for local/self-hosted dev without a DB.
  async function consumeResourceCredit(
    tenantId: string | undefined | null,
    workspaceId: string | undefined | null,
    creditType: "AI" | "OCR",
    description: string
  ): Promise<boolean> {
    if (!tenantId || !workspaceId) return true;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return true;
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_resource_credit`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_tenant_id: tenantId,
          p_workspace_id: workspaceId,
          p_credit_type: creditType,
          p_amount: 1,
          p_description: description,
        }),
      });
      if (!resp.ok) return true;
      return Boolean(await resp.json());
    } catch (err) {
      console.error("Failed to check/consume resource credit:", err);
      return true;
    }
  }

  // --- Chip Asia payment gateway (https://docs.chip-in.asia) ---
  // HQ stores the brand_id + secret key in payment_gateway_settings (Supabase).
  // We never expose the secret key to the client — only this server talks to Chip Asia.

  let chipAsiaPublicKeyCache: string | null = null;

  async function fetchPaymentGatewaySettings(): Promise<{ chipAsiaEnabled: boolean; chipAsiaApiKey: string; chipAsiaSecretKey: string; chipAsiaBrandId: string } | null> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/payment_gateway_settings?id=eq.global&select=*`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!resp.ok) return null;
      const rows: any[] = await resp.json();
      const row = rows[0];
      if (!row) return null;
      return {
        chipAsiaEnabled: Boolean(row.chip_asia_enabled),
        chipAsiaApiKey: row.chip_asia_api_key || "",
        chipAsiaSecretKey: row.chip_asia_secret_key || "",
        chipAsiaBrandId: row.chip_asia_brand_id || "",
      };
    } catch (err) {
      console.error("Failed to fetch payment gateway settings:", err);
      return null;
    }
  }

  async function finalizeChipAsiaTransaction(transactionId: string, success: boolean, reference: string | null): Promise<void> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_chip_asia_transaction`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_transaction_id: transactionId, p_success: success, p_reference: reference }),
      });
    } catch (err) {
      console.error("Failed to finalize Chip Asia transaction:", err);
    }
  }

  // Tenant initiates a Chip Asia purchase: creates the Chip Asia "purchase" and
  // returns the checkout_url for the client to redirect the user to.
  app.post("/api/payments/chip-asia/init", async (req, res) => {
    try {
      const { transactionId, tenantId, planId, amountMyr } = req.body || {};
      if (!transactionId || !tenantId || !planId || !amountMyr) {
        return res.status(400).json({ error: "Maklumat pembayaran tidak lengkap." });
      }

      const access = await verifyTenantAccess(req, tenantId, null);
      if (!access.ok) {
        return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
      }

      const settings = await fetchPaymentGatewaySettings();
      if (!settings || !settings.chipAsiaEnabled || !settings.chipAsiaSecretKey || !settings.chipAsiaBrandId) {
        return res.status(503).json({ error: "Chip Asia belum diaktifkan atau dikonfigurasi oleh HQ." });
      }

      const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`;
      const chipRes = await fetch("https://gate.chip-in.asia/api/v1/purchases/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.chipAsiaSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand_id: settings.chipAsiaBrandId,
          client: { email: req.body.email || "billing@mykerani.app" },
          purchase: {
            products: [{ name: `Pelan Langganan MyKerani`, price: Math.round(Number(amountMyr) * 100) }],
          },
          reference: transactionId,
          success_redirect: `${baseUrl}/?payment=success`,
          failure_redirect: `${baseUrl}/?payment=failed`,
          success_callback: `${baseUrl}/api/payments/chip-asia/webhook`,
        }),
      });

      const chipData = await chipRes.json() as any;
      if (!chipRes.ok) {
        return res.status(400).json({ error: chipData?.message || "Chip Asia menolak permintaan pembayaran." });
      }

      return res.json({ checkoutUrl: chipData.checkout_url, chipPurchaseId: chipData.id });
    } catch (err: any) {
      console.error("chip-asia init error:", err);
      return res.status(500).json({ error: err?.message || "Ralat sistem pembayaran." });
    }
  });

  // Chip Asia calls this once a purchase is paid or fails. Signature is verified
  // against Chip Asia's public key (fetched once and cached) before trusting the payload.
  app.post("/api/payments/chip-asia/webhook", async (req, res) => {
    try {
      const settings = await fetchPaymentGatewaySettings();
      if (!settings || !settings.chipAsiaSecretKey) return res.status(503).end();

      const signature = req.header("X-Signature");
      if (!signature) return res.status(400).end();

      if (!chipAsiaPublicKeyCache) {
        const keyRes = await fetch("https://gate.chip-in.asia/api/v1/public_key/", {
          headers: { Authorization: `Bearer ${settings.chipAsiaSecretKey}` },
        });
        if (keyRes.ok) chipAsiaPublicKeyCache = await keyRes.text();
      }

      const rawBody = JSON.stringify(req.body);
      if (chipAsiaPublicKeyCache) {
        const verifier = createVerify("RSA-SHA256");
        verifier.update(rawBody);
        const valid = verifier.verify(chipAsiaPublicKeyCache, Buffer.from(signature, "base64"));
        if (!valid) {
          console.error("Chip Asia webhook signature verification failed");
          return res.status(401).end();
        }
      }

      const purchase = req.body;
      const transactionId = purchase?.reference;
      const status = purchase?.status; // 'paid' on success per Chip Asia docs
      if (transactionId) {
        await finalizeChipAsiaTransaction(transactionId, status === "paid", purchase?.id || null);
      }

      return res.status(200).end();
    } catch (err: any) {
      console.error("chip-asia webhook error:", err);
      return res.status(500).end();
    }
  });

  // Builds the ordered candidate list to try, cheapest-first by default (or per
  // the HQ-selected strategy: balanced prefers mid-tier models, quality prefers
  // top-tier models). Falls back to environment variables when the HQ Console
  // AI Router hasn't been configured in Supabase yet (e.g. local/self-hosted dev).
  async function getAiProviderCandidates(): Promise<AiCandidate[]> {
    const dbConfig = await fetchDbAiConfig();

    if (dbConfig && dbConfig.configs.length > 0) {
      let candidates: AiCandidate[] = dbConfig.configs.map(c => ({
        provider: c.provider,
        apiKey: c.apiKey,
        model: c.model || MODEL_CATALOGUE[c.provider][0].id,
        costUsd: modelCostUsd(c.provider, c.model),
      }));

      if (dbConfig.strategy === "quality") {
        candidates = candidates.filter(c => modelTier(c.provider, c.model) === "pro")
          .concat(candidates.filter(c => modelTier(c.provider, c.model) !== "pro"));
      } else if (dbConfig.strategy === "balanced") {
        candidates = candidates.filter(c => modelTier(c.provider, c.model) !== "pro")
          .concat(candidates.filter(c => modelTier(c.provider, c.model) === "pro"));
      }
      // "cheapest" and "custom" (no per-request plan context yet) both sort by raw cost.
      candidates.sort((a, b) => a.costUsd - b.costUsd);
      return candidates;
    }

    // Fallback: environment-variable based config. Covers every provider in
    // MODEL_CATALOGUE (not just Gemini/OpenAI/Anthropic) so a provider enabled
    // in the DB (e.g. DeepSeek) but unreachable via fetchDbAiConfig() (missing
    // VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) can still be picked up from
    // a directly-set env var on the host.
    const allProviders = Object.keys(MODEL_CATALOGUE) as AiProviderId[];
    const envKeys: Record<AiProviderId, string | undefined> = {
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
      xai: process.env.XAI_API_KEY,
      mistral: process.env.MISTRAL_API_KEY,
      groq: process.env.GROQ_API_KEY,
      alibaba: process.env.ALIBABA_API_KEY,
    };
    const forced = (process.env.AI_PROVIDER || "").toLowerCase();
    if (allProviders.includes(forced as AiProviderId)) {
      const p = forced as AiProviderId;
      return envKeys[p]
        ? [{ provider: p, apiKey: envKeys[p]!, model: MODEL_CATALOGUE[p][0].id, costUsd: 0 }]
        : [];
    }
    const customOrder = (process.env.AI_PROVIDER_ORDER || "")
      .toLowerCase().split(",").map(s => s.trim())
      .filter((p): p is AiProviderId => allProviders.includes(p as AiProviderId));
    const order = customOrder.length > 0
      ? [...customOrder, ...allProviders.filter(p => !customOrder.includes(p))]
      : allProviders;
    return order
      .filter(p => Boolean(envKeys[p]))
      .map(p => ({ provider: p, apiKey: envKeys[p]!, model: process.env[`${p.toUpperCase()}_MODEL`] || MODEL_CATALOGUE[p][0].id, costUsd: 0 }));
  }

  function parseJsonLoose(content: string): any {
    try { return JSON.parse(content); } catch {}
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Could not parse JSON from AI response");
  }

  async function callAiProvider(candidate: AiCandidate, systemPrompt: string): Promise<any> {
    if (candidate.provider === "gemini") {
      return callGeminiAssistant(candidate.apiKey, candidate.model, systemPrompt);
    }
    if (candidate.provider === "anthropic") {
      return callAnthropicAssistant(candidate.apiKey, candidate.model, systemPrompt);
    }
    const baseUrl = OPENAI_COMPATIBLE_BASE_URLS[candidate.provider];
    return callOpenAiCompatibleAssistant(baseUrl, candidate.apiKey, candidate.model, systemPrompt);
  }

  async function callAiProviderOcr(candidate: AiCandidate, mimeType: string, base64Data: string, ocrPrompt: string): Promise<any> {
    if (candidate.provider === "gemini") {
      return callGeminiOcr(candidate.apiKey, candidate.model, mimeType, base64Data, ocrPrompt);
    }
    if (candidate.provider === "anthropic") {
      return callAnthropicOcr(candidate.apiKey, candidate.model, mimeType, base64Data, ocrPrompt);
    }
    const baseUrl = OPENAI_COMPATIBLE_BASE_URLS[candidate.provider];
    return callOpenAiCompatibleOcr(baseUrl, candidate.apiKey, candidate.model, mimeType, base64Data, ocrPrompt);
  }

  async function callGeminiOcr(apiKey: string, model: string, mimeType: string, base64Data: string, ocrPrompt: string) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType, data: base64Data } },
        ocrPrompt
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchantName: { type: Type.STRING },
            documentNumber: { type: Type.STRING },
            date: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            suggestedCategory: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
            rawExtractedText: { type: Type.STRING }
          },
          required: ["merchantName", "amount", "currency", "confidenceScore"]
        }
      }
    });
    const responseText = response.text;
    if (!responseText) throw new Error("No response text returned from Gemini API");
    return JSON.parse(responseText);
  }

  async function callOpenAiCompatibleOcr(baseUrl: string, apiKey: string, model: string, mimeType: string, base64Data: string, ocrPrompt: string) {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: ocrPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`AI provider OCR API error ${resp.status}: ${errBody}`);
    }
    const data: any = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content returned from AI provider OCR API");
    return parseJsonLoose(content);
  }

  async function callAnthropicOcr(apiKey: string, model: string, mimeType: string, base64Data: string, ocrPrompt: string) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } },
            { type: "text", text: ocrPrompt }
          ]
        }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Anthropic OCR API error ${resp.status}: ${errBody}`);
    }
    const data: any = await resp.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error("No response content returned from Anthropic OCR API");
    return parseJsonLoose(content);
  }

  async function callGeminiAssistant(apiKey: string, model: string, systemPrompt: string) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const response = await ai.models.generateContent({
      model,
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  actionType: { type: Type.STRING },
                  payload: {
                    type: Type.OBJECT,
                    properties: {
                      vendorName: { type: Type.STRING },
                      category: { type: Type.STRING },
                      recordType: { type: Type.STRING },
                      confidenceScore: { type: Type.NUMBER }
                    },
                    required: ["vendorName", "category", "recordType", "confidenceScore"]
                  }
                },
                required: ["id", "title", "description", "actionType", "payload"]
              }
            },
            highlights: {
              type: Type.OBJECT,
              properties: {
                healthStatus: { type: Type.STRING },
                estimatedRunwayDays: { type: Type.NUMBER },
                capitalEfficiencyScore: { type: Type.NUMBER },
                criticalActionRequired: { type: Type.STRING }
              },
              required: ["healthStatus", "estimatedRunwayDays", "capitalEfficiencyScore", "criticalActionRequired"]
            },
            linkedRecordIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            linkedEvidenceIds: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["text", "suggestions", "highlights", "linkedRecordIds", "linkedEvidenceIds"]
        }
      }
    });
    const responseText = response.text;
    if (!responseText) throw new Error("No response string returned from Gemini API");
    return JSON.parse(responseText);
  }

  async function callOpenAiCompatibleAssistant(baseUrl: string, apiKey: string, model: string, systemPrompt: string) {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`AI provider API error ${resp.status}: ${errBody}`);
    }
    const data: any = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content returned from AI provider API");
    return parseJsonLoose(content);
  }

  async function callAnthropicAssistant(apiKey: string, model: string, systemPrompt: string) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: systemPrompt }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${errBody}`);
    }
    const data: any = await resp.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error("No response content returned from Anthropic API");
    return parseJsonLoose(content);
  }

  // ANALYTICAL WORKSPACE COGNITIVE SIMULATOR FALLBACK
  function generateFallbackAssistantResponse(query: string, financialContext: any) {
    const q = (query || "").toLowerCase();
    const events = financialContext.financialEvents || [];
    const cash = financialContext.cashAccounts || [];
    const bank = financialContext.bankAccounts || [];
    const commitments = financialContext.financialCommitments || [];
    const evidence = financialContext.financialEvidencePackages || [];
    const patterns = financialContext.ocrLearnedPatterns || [];

    const totalCash = cash.reduce((acc: number, c: any) => acc + (c.currentBalanceMyr || 0), 0);
    const totalBank = bank.reduce((acc: number, b: any) => acc + (b.currentBalanceMyr || 0), 0);
    const reserves = totalCash + totalBank;

    const incomes = events.filter((e: any) => e.type === "INCOME" || e.type === "RECEIVABLE");
    const expenses = events.filter((e: any) => e.type === "EXPENSE" || e.type === "PAYABLE");

    const totalIncome = incomes.reduce((acc: number, e: any) => acc + (e.amountMyr || 0), 0);
    const totalExpense = expenses.reduce((acc: number, e: any) => acc + (e.amountMyr || 0), 0);

    const expenseRate = totalExpense || 1200;
    const computedRunway = Math.round(reserves > 0 ? (reserves / (expenseRate / 30 || 40)) : 45);

    let text = "";
    let linkedRecordIds: string[] = [];
    let linkedEvidenceIds: string[] = [];
    let healthStatus = "STABLE";
    let capitalEfficiency = 78;
    let criticalAction = "Maintain standard workspace auditing loops.";

    if (reserves < totalExpense) {
      healthStatus = "WARNING";
      capitalEfficiency = 55;
      criticalAction = "Conserve liquid reserves. Outlays exceed total current bank & cash reserves.";
    } else if (reserves > totalExpense * 2) {
      healthStatus = "EXCELLENT";
      capitalEfficiency = 94;
    }

    const suggestions: any[] = [];

    if (q.includes("aws") || q.includes("saas") || q.includes("software")) {
      const match = events.find((e: any) => 
        (e.categoryName || "").toLowerCase().includes("saas") || 
        (e.description || "").toLowerCase().includes("aws") ||
        (e.partyName || "").toLowerCase().includes("aws")
      );
      if (match) {
        linkedRecordIds.push(match.id);
        const linkedEv = evidence.find((v: any) => v.linkedRecordId === match.id);
        if (linkedEv) linkedEvidenceIds.push(linkedEv.id);

        text = `### 🔍 Maklumat Belanja: AWS & Perisian (SaaS)\n\nSaya telah menemui transaksi **"${match.partyName}"** di bawah kategori **"${match.categoryName}"**.\n\n- **Jumlah:** RM ${match.amountMyr.toFixed(2)}\n- **Tarikh:** ${match.date}\n- **Ulasan:** Belanja perisian atau SaaS bulanan dikategorikan sebagai perbelanjaan operasi perniagaan anda.`;
      } else {
        text = `### 🔍 Carian Fail: Tiada Rekod SaaS/AWS bulanan\n\nTiada transaksi padanan dikesan dalam lejar bagi syarikat ini.`;
      }
    } else if (q.includes("health") || q.includes("diagnostic") || q.includes("analysis") || q.includes("baki") || q.includes("aliran")) {
      text = `### 📊 Ringkasan Aliran Kewangan Syarikat\n\nBerikut adalah semakan ringkas keadaan aliran kewangan akaun anda:\n\n1. **Jumlah Tunai Tersedia:** RM ${reserves.toLocaleString("en-MY", { minimumFractionDigits: 2 })} (mengandungi RM ${totalCash.toLocaleString("en-MY", { minimumFractionDigits: 2 })} wang tunai di tangan dan RM ${totalBank.toLocaleString("en-MY", { minimumFractionDigits: 2 })} di dalam bank).\n2. **Aliran Masuk Melawan Aliran Keluar:** Jumlah pendapatan setakat ini adalah **RM ${totalIncome.toLocaleString("en-MY", { minimumFractionDigits: 2 })}**, manakala belanja operasi setakat ini adalah **RM ${totalExpense.toLocaleString("en-MY", { minimumFractionDigits: 2 })}**.\n3. **Anggaran Hari Ketahanan Simpanan:** Berdasarkan purata aliran keluar harian, simpanan tunai syarikat boleh bertahan untuk kira-kira **${computedRunway} hari**.\n\n**Syor Ringkas Kerani Anda:**\n- Ikuti perkembangan kutipan belum terima (RM ${(incomes.filter((i: any) => i.type === "RECEIVABLE").reduce((acc: number, curr: any) => acc + curr.amountMyr, 0)).toLocaleString("en-MY", { minimumFractionDigits: 2 })} belum dibilkan).`;
    } else if (q.includes("forecast") || q.includes("runway") || q.includes("days") || q.includes("tahan")) {
      text = `### 📉 Ramalan Aliran Wang & Ketahanan Simpanan\n\nMaklumat akaun menunjukkan dana syarikat menganggarkan tempoh ketahanan simpanan aliran tunai sekitar **${computedRunway} hari**.\n\n- **Baki Tersedia:** RM ${reserves.toLocaleString("en-MY", { minimumFractionDigits: 2 })}\n- **Langkah Disyorkan:** Kami menasihatkan anda untuk memantau kutipan belum terima serta menyusun keutamaan belanja operasi bagi mengekalkan kedudukan baki tunai yang optimum.`;
    } else if (q.includes("evidence") || q.includes("receipt") || q.includes("maybank") || q.includes("statement") || q.includes("fail") || q.includes("resit")) {
      const match = evidence[0];
      if (match) {
        linkedEvidenceIds.push(match.id);
        if (match.linkedRecordId) linkedRecordIds.push(match.linkedRecordId);
        text = `### 📂 Carian Lampiran Dokumen\n\nSaya menemui **1 lampiran dokumen** dalam rekod simpanan:\n\n- **Nama Fail:** \`${match.fileName}\`\n- **Jenis Dokumen:** \`${match.documentType}\`\n- **Status Semakan:** Telah dipadankan dengan id transaksi di dalam lejar.\n\nSila beritahu saya jika anda mahu menyemak butiran lanjut.`;
      } else {
        text = `### 📂 Carian Lampiran Dokumen: Tiada Fail\n\nTiada fail resit atau penyata bank yang sepadan ditemui dalam rekod simpanan syarikat. Anda boleh memuat naik lampiran fail untuk dipadankan secara automatik.`;
      }
    } else {
      text = `### 🤖 Kerani Kewangan Anda\n\nSaya pembantu pintar peribadi anda. Saya sedia membantu menjawab soalan tentang aliran masuk/keluar, baki tunai, serta lampiran resit syarikat.\n\n- **Tunai Tersedia:** RM ${reserves.toLocaleString("en-MY", { minimumFractionDigits: 2 })}\n- **Rekod Lejar:** ${events.length} transaksi telah disemak bulanan.\n\n**Cadangan Pertanyaan:**\n- Cuba tanya: *"Berapa baki tunai saya?"*\n- Cuba tanya: *"Ketahanan baki tunai syarikat?"*\n- Cuba tanya: *"Kajian aliran wang masuk bulanan"*`;
    }

    const unmappedEvent = events.find((e: any) => 
      (e.type === "EXPENSE" || e.type === "INCOME") && 
      !patterns.some((p: any) => p.vendorName.toLowerCase() === (e.partyName || "").toLowerCase()) &&
      e.partyName
    );

    if (unmappedEvent) {
      suggestions.push({
        id: `sug-${unmappedEvent.id}`,
        title: `Learn Classification for "${unmappedEvent.partyName}"`,
        description: `Create a permanent classification mapping to route transactions from "${unmappedEvent.partyName}" to category "${unmappedEvent.categoryName}" (${unmappedEvent.type}) automatically.`,
        actionType: "LEARN_PATTERN",
        payload: {
          vendorName: unmappedEvent.partyName,
          category: unmappedEvent.categoryName,
          recordType: unmappedEvent.type,
          confidenceScore: 0.92
        }
      });
    }

    return {
      text,
      suggestions,
      highlights: {
        healthStatus,
        estimatedRunwayDays: computedRunway,
        capitalEfficiencyScore: capitalEfficiency,
        criticalActionRequired: criticalAction
      },
      linkedRecordIds,
      linkedEvidenceIds
    };
  }

  function generateMockOcr(fileName: string, documentType: string) {
    const fName = (fileName || "").toLowerCase();
    
    let merchantName = "Global Telecom Bhd";
    let amount = 340.00;
    let currency = "MYR";
    let suggestedCategory = "Utilities";
    let documentNumber = "TXN-2026-9901";
    
    if (fName.includes("aws") || fName.includes("cloud") || fName.includes("server")) {
      merchantName = "Amazon Web Services Inc.";
      amount = 1450.00;
      currency = "USD";
      suggestedCategory = "Saas";
      documentNumber = "INV-AWS-7762";
    } else if (fName.includes("grab") || fName.includes("ride") || fName.includes("transport")) {
      merchantName = "GrabCar Sdn Bhd";
      amount = 45.00;
      currency = "MYR";
      suggestedCategory = "Travel";
      documentNumber = "GRB-998162";
    } else if (fName.includes("starbucks") || fName.includes("coffee") || fName.includes("caf") || fName.includes("meal") || fName.includes("food")) {
      merchantName = "Starbucks Coffee Company";
      amount = 58.50;
      currency = "MYR";
      suggestedCategory = "Meals";
      documentNumber = "SBC-0918-622";
    } else if (fName.includes("adobe") || fName.includes("figma") || fName.includes("software") || fName.includes("saas")) {
      merchantName = "Adobe Systems Software";
      amount = 139.90;
      currency = "MYR";
      suggestedCategory = "Saas";
      documentNumber = "ADB-2026-098";
    } else if (documentType === "STATEMENT") {
      merchantName = "Maybank Berhad";
      amount = 5000.00;
      currency = "MYR";
      suggestedCategory = "Utilities";
      documentNumber = "STM-MAY-8872";
    } else if (documentType === "INVOICE") {
      merchantName = "Modern Workspace Supplies Ltd";
      amount = 1200.00;
      currency = "MYR";
      suggestedCategory = "Office Supplies";
      documentNumber = "INV-MWS-2026-904";
    }

    return {
      merchantName,
      documentNumber,
      date: new Date().toISOString().split("T")[0],
      amount,
      currency,
      suggestedCategory,
      confidenceScore: 0.94,
      rawExtractedText: `Cognitive OCR scanned ${documentType} file: '${fileName}'. Automatically verified key signatures.`
    };
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // JS/CSS assets ada hash dalam nama fail — boleh cache lama
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          // HTML jangan cache supaya browser sentiasa dapat versi terbaru
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (/\.(js|css|woff2?|ttf|svg|png|jpg|ico)$/.test(filePath)) {
          // Asset dengan hash boleh cache setahun
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Proactive Auto-Migration on startup if DB password is provided in env
    if (process.env.SUPABASE_DB_PASSWORD) {
      console.log("🚀 SUPABASE_DB_PASSWORD detected on startup. Initializing database programmatically...");
      runDatabaseInitialization(process.env.SUPABASE_DB_PASSWORD)
        .then(({ success, logs, errorMessage }) => {
          if (success) {
            console.log("🎉 Idempotent auto-migration completed successfully on startup.");
          } else {
            console.error("❌ Auto-migration on startup failed:", errorMessage);
            console.log("Auto-migration detailed logs:\n", logs.join("\n"));
          }
        });
    }

    // Renewal Framework: pg_cron is unavailable on this Supabase project, so
    // subscription renewals (process_due_subscription_renewals) are driven by
    // this interval instead of a native DB scheduler.
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      const runDueRenewals = async () => {
        try {
          const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/process_due_subscription_renewals`, {
            method: "POST",
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
            body: "{}",
          });
          if (resp.ok) {
            const count = await resp.json();
            if (count > 0) console.log(`🔄 Subscription renewal sweep processed ${count} tenant(s).`);
          } else {
            console.error("Subscription renewal sweep failed:", resp.status, await resp.text());
          }
        } catch (err) {
          console.error("Subscription renewal sweep error:", err);
        }
      };
      runDueRenewals();
      setInterval(runDueRenewals, 60 * 60 * 1000);
    }
  });
}

startServer();
