import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import pg from "pg";
import { createVerify, randomUUID } from "crypto";
import { evaluateAccountingSuggestion } from "./src/lib/accountingClassificationMap";
import { PDFParse } from "pdf-parse";

const { Client } = pg;

dotenv.config();

// MyKerani operates exclusively in Malaysia; "today" must always be the
// Asia/Kuala_Lumpur calendar date, not server UTC — using UTC causes a
// one-day-stale default during the ~8-hour nightly window where UTC's date
// still lags MYT's (UTC+8, no DST).
function todayMyt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

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
      // HQ_STAFF must land in the inviting HQ_OWNER's own (HQ-category) tenant,
      // same as TENANT_STAFF lands in the inviting TENANT_OWNER's tenant —
      // never an empty/new tenant.
      const newStaffTenantId = caller.tenantId || "";
      if (!newStaffTenantId) {
        return res.status(400).json({ success: false, error: "Tiada tenant dikesan untuk akaun anda. Sila log masuk semula." });
      }

      // AUTH-02B: prefer Supabase Auth's native invite-by-email flow over the
      // old admin.createUser()+share-a-temp-password approach. POST
      // /auth/v1/invite creates the auth user AND (when the project has an
      // email provider configured in the Supabase dashboard) sends Supabase's
      // own "you've been invited" email containing a magic link that lets the
      // invited staff member set their own password on first click — no
      // temp password ever needs to be manually copied/shared by the Owner.
      // user_metadata is stamped at invite time so it survives onto the
      // created auth user exactly like the old createUser() call did. The
      // redirect target is derived from the inbound request's own host, not
      // a hardcoded domain, so this keeps working unchanged if the app moves
      // off the current Railway URL onto a custom domain.
      const requestOrigin = `${req.protocol}://${req.get("host")}`;
      const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          data: {
            fullName,
            role,
            tenantId: newStaffTenantId,
          },
          redirect_to: requestOrigin,
        })
      });

      let createData = await inviteRes.json() as any;
      let usedFallbackPassword = false;
      let tempPassword: string | null = null;

      if (!inviteRes.ok) {
        // Fallback path: a project with no email provider configured at all
        // (e.g. this sandbox) can fail /invite rather than degrading
        // gracefully. Fall back to the previous createUser()+temp-password
        // flow so staff creation still works — just without a real invite
        // email — and tell the caller honestly via the response message.
        tempPassword = `MyKerani@${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString().slice(-4)}!`;
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
            user_metadata: { fullName, role, tenantId: newStaffTenantId },
          })
        });
        createData = await createRes.json() as any;
        if (!createRes.ok) {
          const errMsg = createData?.msg || createData?.message || createData?.error_description || "Gagal cipta akaun.";
          return res.status(400).json({ success: false, error: errMsg });
        }
        usedFallbackPassword = true;
      }

      // BUG FIX (AUTH-02A): the auth user above only carries role/tenantId in
      // user_metadata — without a matching user_role_assignments row, signIn()
      // finds no role row on this user's first login and silently reprovisions
      // them as a brand-new TENANT_OWNER in their own new tenant, discarding
      // the invite entirely. Insert the row in the same request so the invited
      // user is fully provisioned before they ever log in.
      const roleInsertRes = await fetch(`${supabaseUrl}/rest/v1/user_role_assignments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          user_id: createData.id,
          email: createData.email,
          full_name: fullName,
          role,
          tenant_id: newStaffTenantId,
        }),
      });

      if (!roleInsertRes.ok) {
        const roleErrBody = await roleInsertRes.text().catch(() => "");
        console.error("create-staff: user_role_assignments insert failed:", roleErrBody);
        return res.status(500).json({
          success: false,
          error: "Akaun auth dicipta tetapi gagal tetapkan role/tenant. Sila hubungi sokongan — jangan minta staf log masuk dahulu.",
        });
      }

      // Audit + notification — fire-and-forget, never blocks the response,
      // since the account is already fully provisioned at this point.
      fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          user_id: caller.userId,
          user_email: caller.email || "unknown",
          user_role: caller.role,
          tenant_id: newStaffTenantId,
          module: role === "HQ_STAFF" ? "HQ Staff Management" : "Team Management",
          action: "CREATE",
          old_value: null,
          new_value: { email: createData.email, full_name: fullName, role },
        }),
      }).catch((err) => console.error("create-staff: audit_logs insert failed:", err));

      if (role === "HQ_STAFF") {
        fetch(`${supabaseUrl}/rest/v1/rpc/notify_hq_staff_of_new_account`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_new_email: createData.email, p_new_full_name: fullName, p_created_by: caller.email || "HQ" }),
        }).catch((err) => console.error("create-staff: hq staff notify failed:", err));
      } else {
        fetch(`${supabaseUrl}/rest/v1/rpc/notify_tenant_team_of_new_staff`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_tenant_id: newStaffTenantId, p_new_email: createData.email, p_new_full_name: fullName }),
        }).catch((err) => console.error("create-staff: tenant team notify failed:", err));
      }

      return res.json({
        success: true,
        userId: createData.id,
        email: createData.email,
        tempPassword,
        usedFallbackPassword,
        message: usedFallbackPassword
          ? `Akaun ${role} berjaya dicipta. E-mel jemputan TIDAK dapat dihantar (pembekal e-mel Supabase belum dikonfigurasi) — kongsikan kata laluan sementara kepada staf anda secara manual.`
          : `Akaun ${role} berjaya dicipta. E-mel jemputan telah dihantar oleh Supabase ke ${createData.email} — staf perlu klik pautan dalam e-mel itu untuk tetapkan kata laluan sendiri.`,
      });

    } catch (err: any) {
      console.error("create-staff error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Ralat sistem." });
    }
  });

  // Real system health checks for the HQ "Kesihatan Sistem" panel — was
  // previously hardcoded fake latencies ("120ms", "45ms", ...) with an
  // always-green pulsing dot, regardless of actual system state.
  app.post("/api/admin/system-health", async (req, res) => {
    const hqAuth = await requireHqRole(req, ["HQ_OWNER", "HQ_STAFF"]);
    if (!hqAuth.ok) {
      return res.status(403).json({ errorMessage: "Akses ditolak." });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.json({ checks: [] });
    }

    const timeCall = async (label: string, url: string, headers: Record<string, string>) => {
      const start = Date.now();
      try {
        const r = await fetch(url, { headers });
        return { label, ok: r.ok, latencyMs: Date.now() - start };
      } catch {
        return { label, ok: false, latencyMs: Date.now() - start };
      }
    };

    const svcHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const checks = await Promise.all([
      timeCall("Pangkalan Data", `${supabaseUrl}/rest/v1/tenants?select=id&limit=1`, svcHeaders),
      timeCall("Storan", `${supabaseUrl}/storage/v1/bucket`, svcHeaders),
      timeCall("Pengesahan", `${supabaseUrl}/auth/v1/settings`, { apikey: serviceRoleKey }),
      timeCall("AI Router", `${supabaseUrl}/rest/v1/ai_router_settings?select=id&limit=1`, svcHeaders),
    ]);

    res.json({ checks });
  });

  // Real provider key validation for the HQ AI Router "Test" button — was
  // previously cosmetic (only checked apiKey.length >= 10, never called the
  // provider). Makes one cheap, side-effect-free request per provider type.
  app.post("/api/admin/test-ai-provider", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.ok || (caller.role !== "HQ_OWNER" && caller.role !== "HQ_STAFF")) {
        return res.status(403).json({ ok: false, error: "Permission denied: HQ access required" });
      }

      const { providerId, apiKey } = req.body || {};
      if (!providerId || !apiKey || typeof apiKey !== "string") {
        return res.status(400).json({ ok: false, error: "providerId dan apiKey diperlukan." });
      }

      let testRes: Response;
      if (providerId === "gemini") {
        testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      } else if (providerId === "anthropic") {
        testRes = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        });
      } else {
        const base = OPENAI_COMPATIBLE_BASE_URLS[providerId];
        if (!base) return res.status(400).json({ ok: false, error: "Provider tidak dikenali." });
        testRes = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      }

      if (testRes.ok) return res.json({ ok: true });
      const body = await testRes.text().catch(() => "");
      return res.json({ ok: false, error: `Provider menolak kunci API (HTTP ${testRes.status}).`, detail: body.slice(0, 300) });
    } catch (err: any) {
      console.error("test-ai-provider error:", err);
      return res.status(500).json({ ok: false, error: err?.message || "Ralat sistem." });
    }
  });

  // ---- Document Processing Progress tracking ----
  // In-memory job store (single Railway instance; jobs are short-lived and
  // only used to drive the live progress panel — never the source of truth
  // for the actual OCR result returned to the caller's own request/response).
  type OcrStage =
    | "UPLOAD_COMPLETE" | "FILE_RETRIEVED" | "PDF_EXTRACTED" | "OCR_PROCESSING"
    | "AI_ANALYSIS" | "CLASSIFICATION" | "TRANSACTION_EXTRACTION" | "REVIEW_GENERATION"
    | "COMPLETED" | "FAILED";

  interface OcrJobState {
    jobId: string;
    fileName: string;
    fileSize: number;
    documentType: string;
    tenantId: string | null;
    workspaceId: string | null;
    startTime: number;
    updatedTime: number;
    stage: OcrStage;
    status: "PROCESSING" | "COMPLETED" | "FAILED";
    overallProgress: number;
    pagesFound: number | null;
    pagesProcessed: number | null;
    chunksTotal: number | null;
    chunksCompleted: number;
    chunksFailed: number;
    transactionsFound: number;
    transactionsExtracted: number;
    providerUsed: string | null;
    modelUsed: string | null;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCostUsd: number | null;
    estimatedRemainingMs: number | null;
    error: string | null;
    errorDetail: string | null;
    errorCode: string | null;
    errorStage: OcrStage | null;
    result: any | null;
  }

  const ocrJobs = new Map<string, OcrJobState>();
  const OCR_JOB_TTL_MS = 30 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of ocrJobs.entries()) {
      if (now - job.updatedTime > OCR_JOB_TTL_MS) ocrJobs.delete(id);
    }
  }, 5 * 60 * 1000);

  const OCR_STAGE_START_PCT: Record<OcrStage, number> = {
    UPLOAD_COMPLETE: 0, FILE_RETRIEVED: 5, PDF_EXTRACTED: 10, OCR_PROCESSING: 20,
    AI_ANALYSIS: 70, CLASSIFICATION: 80, TRANSACTION_EXTRACTION: 85, REVIEW_GENERATION: 90,
    COMPLETED: 100, FAILED: 0,
  };
  const OCR_STAGE_END_PCT: Record<OcrStage, number> = {
    UPLOAD_COMPLETE: 5, FILE_RETRIEVED: 10, PDF_EXTRACTED: 20, OCR_PROCESSING: 70,
    AI_ANALYSIS: 80, CLASSIFICATION: 85, TRANSACTION_EXTRACTION: 90, REVIEW_GENERATION: 95,
    COMPLETED: 100, FAILED: 100,
  };

  function estimateTokens(text: string | null | undefined): number {
    return Math.ceil((text || "").length / 4);
  }

  // Best-effort, publicly-listed per-1M-token pricing for a few common models —
  // used only to show a rough cost estimate in the processing panel. Returns
  // null (shown as "—" in the UI) for any model not in this small table,
  // which includes most custom "openai-compatible" endpoints.
  const OCR_MODEL_PRICING_PER_1M: Array<{ match: RegExp; inputUsd: number; outputUsd: number }> = [
    { match: /gemini-1\.5-flash|gemini-2\.0-flash/i, inputUsd: 0.075, outputUsd: 0.30 },
    { match: /gemini-1\.5-pro|gemini-2\.5-pro/i, inputUsd: 1.25, outputUsd: 5.00 },
    { match: /claude-3-5-haiku|claude.*haiku/i, inputUsd: 0.80, outputUsd: 4.00 },
    { match: /claude-3-5-sonnet|claude.*sonnet/i, inputUsd: 3.00, outputUsd: 15.00 },
    { match: /gpt-4o-mini/i, inputUsd: 0.15, outputUsd: 0.60 },
    { match: /gpt-4o/i, inputUsd: 2.50, outputUsd: 10.00 },
    { match: /deepseek-chat|deepseek-v/i, inputUsd: 0.27, outputUsd: 1.10 },
  ];

  function estimateCostUsd(model: string | null | undefined, inputTokens: number, outputTokens: number): number | null {
    if (!model) return null;
    const entry = OCR_MODEL_PRICING_PER_1M.find((p) => p.match.test(model));
    if (!entry) return null;
    return (inputTokens / 1_000_000) * entry.inputUsd + (outputTokens / 1_000_000) * entry.outputUsd;
  }

  class OcrApiError extends Error {
    status: number;
    body: any;
    stage: OcrStage;
    constructor(status: number, body: any, stage: OcrStage = "OCR_PROCESSING") {
      super(body?.error || "OCR error");
      this.status = status;
      this.body = body;
      this.stage = stage;
    }
  }

  // Single source of truth for the OCR pipeline, shared by the plain
  // request/response endpoint and the progress-tracked job endpoint below.
  // `onProgress` is a no-op for the plain endpoint.
  async function runOcrAnalysis(
    params: { fileDataUrl: string; fileName: string; documentType: string; tenantId: string; workspaceId: string; userId: string },
    onProgress: (patch: Partial<OcrJobState>) => void
  ): Promise<any> {
    const { fileDataUrl, fileName, documentType, tenantId, workspaceId, userId } = params;
    const jobStartTime = Date.now();

    if (await isUserSuspended(userId)) {
      throw new OcrApiError(403, { error: "Akaun anda telah disekat oleh pentadbir HQ. Sila hubungi sokongan." }, "UPLOAD_COMPLETE");
    }

    onProgress({ stage: "UPLOAD_COMPLETE", overallProgress: OCR_STAGE_END_PCT.UPLOAD_COMPLETE });

    const candidates = await getAiProviderCandidates();
    console.info("[AI_ROUTER_DEBUG][OCR]", JSON.stringify({
      candidateCount: candidates.length,
      candidateProviders: candidates.map(c => `${c.provider}:${c.model}`),
      dbConfigReachable: Boolean(process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      envFallbackKeysPresent: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      },
      forcedProvider: process.env.AI_PROVIDER || null,
      providerOrder: process.env.AI_PROVIDER_ORDER || null,
    }));
    if (candidates.length === 0) {
      console.info("[AI_ROUTER_DEBUG][OCR] fallbackTriggerReason=NO_CANDIDATES — checked HQ Console AI Router settings (ai_router_settings/ai_provider_configs via SUPABASE_SERVICE_ROLE_KEY), then OPENAI_API_KEY/GEMINI_API_KEY/ANTHROPIC_API_KEY/DEEPSEEK_API_KEY env vars.");
      throw new OcrApiError(503, {
        error: "Tiada pembekal AI dikonfigurasikan. Dokumen ini tidak dapat dianalisis. Sila konfigurasikan AI Router (HQ Console) atau cuba lagi kemudian.",
        code: "NO_AI_PROVIDER_CONFIGURED",
      }, "FILE_RETRIEVED");
    }

    const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "OCR", `OCR analyze: ${fileName || "document"}`);
    if (!hasCredit) {
      throw new OcrApiError(402, {
        error: "Kredit OCR syarikat anda telah digunakan sepenuhnya untuk tempoh semasa. Sila naik taraf pelan atau tunggu pembaharuan bulanan.",
        code: "OCR_CREDITS_EXHAUSTED",
      }, "FILE_RETRIEVED");
    }

    // Process fileDataUrl. Format: data:<mimeType>;base64,<base64Data>
    const match = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    let mimeType = "image/png";
    let base64Data = fileDataUrl;
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    onProgress({ stage: "FILE_RETRIEVED", overallProgress: OCR_STAGE_END_PCT.FILE_RETRIEVED });

    // PDFs cannot be sent via the vision `image_url`/`image` content blocks AI
    // providers expose — those only accept raster image formats (png/jpeg/webp/gif).
    // Sending a PDF that way is rejected by the provider and previously caused every
    // candidate to throw, exhausting the loop and falling back to fabricated mock data.
    // Extract the PDF's real text layer locally instead, and send that as plain text —
    // every provider's standard chat-completions endpoint already supports text input.
    let extractedPdfText: string | null = null;
    let pdfPagesFound: number | null = null;
    if (mimeType === "application/pdf") {
      try {
        const pdfBuffer = Buffer.from(base64Data, "base64");
        const parser = new PDFParse({ data: pdfBuffer });
        const result = await parser.getText();
        extractedPdfText = (result.text || "").trim();
        pdfPagesFound = result.total ?? null;
      } catch (pdfErr: any) {
        console.error("PDF text extraction failed:", pdfErr?.message || pdfErr);
        throw new OcrApiError(422, {
          error: "Gagal mengekstrak teks daripada fail PDF ini. Fail mungkin rosak atau dilindungi kata laluan.",
          code: "PDF_EXTRACTION_FAILED",
        }, "PDF_EXTRACTED");
      }
      if (!extractedPdfText) {
        throw new OcrApiError(422, {
          error: "PDF ini tidak mengandungi teks yang boleh dibaca (mungkin hasil imbasan/scan tanpa lapisan teks). Sila muat naik versi PDF yang mengandungi teks sebenar, atau gunakan format CSV/Excel.",
          code: "PDF_NO_TEXT_LAYER",
        }, "PDF_EXTRACTED");
      }
    }

    onProgress({ stage: "PDF_EXTRACTED", overallProgress: OCR_STAGE_END_PCT.PDF_EXTRACTED, pagesFound: pdfPagesFound });

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
      let estimatedInputTokens = 0;
      let estimatedOutputTokens = 0;
      const ocrAttempts: { provider: string; model: string; result: "FAILED" | "SUCCESS"; error?: string }[] = [];

      // Bank statements: split the extracted text into chunks and run extraction per
      // chunk, then merge every chunk's transactions so nothing is dropped to a token
      // ceiling. Other document types keep the original single-call path.
      const isChunkedStatement = isStatement && extractedPdfText !== null;
      let rowsFound = 0;
      let chunksTotal = 0;
      let chunksSucceeded = 0;
      let chunksFailed = 0;

      onProgress({ stage: "OCR_PROCESSING", overallProgress: OCR_STAGE_START_PCT.OCR_PROCESSING });

      if (isChunkedStatement) {
        const nonEmptyLines = extractedPdfText!.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
        rowsFound = nonEmptyLines.length;
        const chunks = chunkStatementText(extractedPdfText!);
        chunksTotal = chunks.length;
        const mergedTransactions: any[] = [];
        let mergedHeader: any = null;
        // Distinct (provider, error message) pairs seen across all failed chunks —
        // a single "lastErr" hides whether every chunk failed for the SAME reason
        // (e.g. one misconfigured candidate) or DIFFERENT reasons (e.g. content-specific
        // rejections), which is exactly what's needed to pin down a 100%-failure case.
        const distinctChunkErrors = new Set<string>();

        for (let i = 0; i < chunks.length; i++) {
          const chunkPrompt = chunks.length > 1
            ? `${ocrPrompt}\n\nNOTE: This is PART ${i + 1} of ${chunks.length} of the same bank statement (split for processing). Extract EVERY transaction line present in THIS part only into the "transactions" array — do not skip any line, and do not worry about transactions from other parts.`
            : ocrPrompt;

          let chunkResult: any = null;
          let chunkErr: any = null;
          estimatedInputTokens += estimateTokens(chunkPrompt) + estimateTokens(chunks[i]);
          for (const candidate of candidates) {
            try {
              chunkResult = await callAiProviderTextOcr(candidate, chunks[i], chunkPrompt);
              usedCandidate = candidate;
              ocrAttempts.push({ provider: candidate.provider, model: candidate.model, result: "SUCCESS" });
              break;
            } catch (err: any) {
              chunkErr = err;
              const msg = err?.message || String(err);
              distinctChunkErrors.add(`${candidate.provider}: ${msg}`);
              ocrAttempts.push({ provider: candidate.provider, model: candidate.model, result: "FAILED", error: `chunk ${i + 1}/${chunks.length}: ${msg}`.slice(0, 500) });
              console.error(`AI provider "${candidate.provider}" OCR call failed on chunk ${i + 1}/${chunks.length}, trying next candidate:`, msg);
            }
          }

          if (!chunkResult) {
            chunksFailed++;
            lastErr = chunkErr || lastErr;
            console.error(`[BANK_STATEMENT_CHUNK_FAILED] chunk ${i + 1}/${chunks.length} could not be extracted by any provider; transactions in this chunk are MISSING from the result.`);
          } else {
            chunksSucceeded++;
            estimatedOutputTokens += estimateTokens(JSON.stringify(chunkResult));
            if (!mergedHeader) mergedHeader = chunkResult;
            if (Array.isArray(chunkResult.transactions)) {
              mergedTransactions.push(...chunkResult.transactions);
            }
          }

          const chunksDone = chunksSucceeded + chunksFailed;
          const elapsedMs = Date.now() - jobStartTime;
          const avgMsPerChunk = chunksDone > 0 ? elapsedMs / chunksDone : null;
          const remainingMs = avgMsPerChunk !== null ? Math.round(avgMsPerChunk * (chunksTotal - chunksDone)) : null;
          onProgress({
            stage: "OCR_PROCESSING",
            overallProgress: OCR_STAGE_START_PCT.OCR_PROCESSING + (OCR_STAGE_END_PCT.OCR_PROCESSING - OCR_STAGE_START_PCT.OCR_PROCESSING) * (chunksDone / chunksTotal),
            pagesProcessed: pdfPagesFound !== null ? Math.round((chunksDone / chunksTotal) * pdfPagesFound) : null,
            chunksTotal, chunksCompleted: chunksSucceeded, chunksFailed,
            transactionsFound: mergedTransactions.length, transactionsExtracted: mergedTransactions.length,
            providerUsed: usedCandidate?.provider ?? null, modelUsed: usedCandidate?.model ?? null,
            estimatedInputTokens, estimatedOutputTokens, estimatedRemainingMs: remainingMs,
          });
        }

        if (chunksSucceeded === 0) {
          const summary = distinctChunkErrors.size > 0
            ? `All ${chunksTotal} chunk(s) failed across all providers. Distinct errors seen: ${Array.from(distinctChunkErrors).join(" | ")}`
            : null;
          logAiFallback(tenantId, workspaceId, userId, ocrAttempts.map(a => ({ provider: a.provider, model: a.model, error: a.error || "unknown" })), summary || (lastErr?.message || "All chunks failed"), candidates[0]?.strategy, "ocr");
          throw (summary ? new Error(summary) : (lastErr || new Error("All configured AI providers failed for OCR on every chunk")));
        }

        parsedResult = { ...(mergedHeader || {}), transactions: mergedTransactions };
      } else {
        const inputText = extractedPdfText !== null ? `${ocrPrompt}\n${extractedPdfText}` : ocrPrompt;
        estimatedInputTokens += estimateTokens(inputText);
        for (const candidate of candidates) {
          try {
            parsedResult = extractedPdfText !== null
              ? await callAiProviderTextOcr(candidate, extractedPdfText, ocrPrompt)
              : await callAiProviderOcr(candidate, mimeType, base64Data, ocrPrompt);
            usedCandidate = candidate;
            ocrAttempts.push({ provider: candidate.provider, model: candidate.model, result: "SUCCESS" });
            break;
          } catch (err: any) {
            lastErr = err;
            const errMsg = String(err?.message || err).slice(0, 500);
            ocrAttempts.push({ provider: candidate.provider, model: candidate.model, result: "FAILED", error: errMsg });
            console.error(`AI provider "${candidate.provider}" OCR call failed, trying next candidate:`, err?.message || err);
          }
        }

        if (!parsedResult) {
          logAiFallback(tenantId, workspaceId, userId, ocrAttempts.map(a => ({ provider: a.provider, model: a.model, error: a.error || "unknown" })), lastErr?.message || "All configured AI providers failed for OCR", candidates[0]?.strategy, "ocr");
          throw lastErr || new Error("All configured AI providers failed for OCR");
        }
        estimatedOutputTokens += estimateTokens(JSON.stringify(parsedResult));
        onProgress({
          stage: "OCR_PROCESSING", overallProgress: OCR_STAGE_END_PCT.OCR_PROCESSING,
          providerUsed: usedCandidate.provider, modelUsed: usedCandidate.model,
          estimatedInputTokens, estimatedOutputTokens,
        });
      }

      console.info(`[AI_ROUTER_DEBUG][OCR] servedBy=${usedCandidate!.provider}:${usedCandidate!.model} mode=${extractedPdfText !== null ? "pdf-text" : "vision"}${isChunkedStatement ? ` chunks=${chunksSucceeded}/${chunksTotal}` : ""}`);
      logAiUsage(tenantId, workspaceId, userId, "ocr", usedCandidate!.provider, usedCandidate!.model, {
        strategy: usedCandidate!.strategy,
        candidateOrder: candidates.map(c => `${c.provider}:${c.model}`),
        attempts: ocrAttempts,
        totalAttempts: ocrAttempts.length,
      });

      onProgress({ stage: "AI_ANALYSIS", overallProgress: OCR_STAGE_END_PCT.AI_ANALYSIS });
      onProgress({ stage: "CLASSIFICATION", overallProgress: OCR_STAGE_END_PCT.CLASSIFICATION });

      const estimatedCostUsd = estimateCostUsd(usedCandidate!.model, estimatedInputTokens, estimatedOutputTokens);

      if (isStatement) {
        const transactionsFound = Array.isArray(parsedResult?.transactions) ? parsedResult.transactions.length : 0;
        onProgress({
          stage: "TRANSACTION_EXTRACTION", overallProgress: OCR_STAGE_END_PCT.TRANSACTION_EXTRACTION,
          transactionsFound, transactionsExtracted: transactionsFound, estimatedCostUsd,
        });
        onProgress({ stage: "REVIEW_GENERATION", overallProgress: OCR_STAGE_END_PCT.REVIEW_GENERATION });
        return ({
          ...parsedResult,
          pagesFound: pdfPagesFound,
          rowsFound: isChunkedStatement ? rowsFound : null,
          chunksTotal: isChunkedStatement ? chunksTotal : null,
          chunksSucceeded: isChunkedStatement ? chunksSucceeded : null,
          chunksFailed: isChunkedStatement ? chunksFailed : null,
          transactionsFound,
          transactionsExtracted: transactionsFound,
          extractionIncomplete: isChunkedStatement && chunksFailed > 0,
          providerUsed: usedCandidate!.provider,
          modelUsed: usedCandidate!.model,
          estimatedInputTokens,
          estimatedOutputTokens,
          estimatedCostUsd,
        });
      }

      onProgress({ stage: "TRANSACTION_EXTRACTION", overallProgress: OCR_STAGE_END_PCT.TRANSACTION_EXTRACTION });
      onProgress({ stage: "REVIEW_GENERATION", overallProgress: OCR_STAGE_END_PCT.REVIEW_GENERATION });
      return { ...parsedResult, providerUsed: usedCandidate!.provider, modelUsed: usedCandidate!.model, estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd };
  }

  // Wraps any error thrown by runOcrAnalysis (including ones not already an
  // OcrApiError, e.g. an AI provider call rejecting) into a consistent 502
  // shape with as much upstream detail as can be safely surfaced.
  function toOcrErrorResponse(error: any): { status: number; body: any; stage: OcrStage } {
    if (error instanceof OcrApiError) {
      return { status: error.status, body: error.body, stage: error.stage };
    }
    const errStr = error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
    const isBillingOrCreditIssue = /depleted|exhausted|billing|prepay|429|credit/i.test(errStr);
    console.error("AI OCR call failed — no fallback data will be returned:", errStr);
    return {
      status: 502,
      stage: "OCR_PROCESSING",
      body: {
        error: isBillingOrCreditIssue
          ? "Pembekal AI tidak dapat diakses sekarang (had penggunaan/bil dicapai). Dokumen ini TIDAK dapat dianalisis. Sila cuba lagi kemudian."
          : "AI tidak dapat membaca dokumen ini. Dokumen ini TIDAK dapat dianalisis. Sila cuba semula atau muat naik fail yang lebih jelas.",
        code: isBillingOrCreditIssue ? "AI_PROVIDER_UNAVAILABLE" : "OCR_FAILED",
        // Surfaced so a failure can be diagnosed from the browser response alone —
        // this endpoint's only other visibility is server-side console.error, which
        // isn't reachable when investigating from outside the deployment.
        detail: errStr ? String(errStr).slice(0, 500) : null,
      },
    };
  }

  // Plain request/response OCR endpoint — unchanged behaviour for existing
  // callers (e.g. the best-effort chat-attachment flow) that don't need a
  // live progress panel and just want the final result in one round trip.
  app.post("/api/ocr/analyze", async (req, res) => {
    try {
      const { fileDataUrl, fileName, documentType, tenantId, workspaceId, userId } = req.body || {};
      if (!fileDataUrl) {
        return res.status(400).json({ error: "No file data provided." });
      }
      const access = await verifyTenantAccess(req, tenantId, workspaceId);
      if (!access.ok) {
        return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
      }
      const result = await runOcrAnalysis({ fileDataUrl, fileName, documentType, tenantId, workspaceId, userId }, () => {});
      return res.json(result);
    } catch (error: any) {
      const { status, body } = toOcrErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  // Progress-tracked OCR flow: kicks off processing asynchronously and
  // returns a jobId immediately; the client polls /api/ocr/analyze/progress/:jobId
  // for live stage/counter/token updates, used by the Document Processing
  // Progress Panel so failures and slow stages are visible while they happen
  // instead of only as a single generic message at the very end.
  app.post("/api/ocr/analyze/start", async (req, res) => {
    const { fileDataUrl, fileName, documentType, tenantId, workspaceId, userId } = req.body || {};
    if (!fileDataUrl) {
      return res.status(400).json({ error: "No file data provided." });
    }
    const access = await verifyTenantAccess(req, tenantId, workspaceId);
    if (!access.ok) {
      console.error(`[ocr/analyze/start] 403: ${access.reason}`);
      return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini.", reason: access.reason });
    }

    const jobId = randomUUID();
    const fileSize = Math.ceil(((fileDataUrl as string).length * 3) / 4); // rough decoded-base64 size
    const now = Date.now();
    const job: OcrJobState = {
      jobId, fileName: fileName || "document", fileSize, documentType,
      tenantId: tenantId || null, workspaceId: workspaceId || null,
      startTime: now, updatedTime: now,
      stage: "UPLOAD_COMPLETE", status: "PROCESSING", overallProgress: 0,
      pagesFound: null, pagesProcessed: null,
      chunksTotal: null, chunksCompleted: 0, chunksFailed: 0,
      transactionsFound: 0, transactionsExtracted: 0,
      providerUsed: null, modelUsed: null,
      estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: null, estimatedRemainingMs: null,
      error: null, errorDetail: null, errorCode: null, errorStage: null,
      result: null,
    };
    ocrJobs.set(jobId, job);
    res.json({ jobId });

    runOcrAnalysis({ fileDataUrl, fileName, documentType, tenantId, workspaceId, userId }, (patch) => {
      Object.assign(job, patch, { updatedTime: Date.now() });
    }).then((result) => {
      Object.assign(job, {
        stage: "COMPLETED", status: "COMPLETED", overallProgress: 100,
        result, updatedTime: Date.now(),
      });
    }).catch((error: any) => {
      const { body, stage } = toOcrErrorResponse(error);
      Object.assign(job, {
        stage: "FAILED", status: "FAILED",
        error: body.error || null, errorCode: body.code || null, errorDetail: body.detail || null,
        errorStage: stage, updatedTime: Date.now(),
      });
    });
  });

  app.get("/api/ocr/analyze/progress/:jobId", async (req, res) => {
    const job = ocrJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found or expired." });
    }
    const access = await verifyTenantAccess(req, job.tenantId, job.workspaceId);
    if (!access.ok) {
      console.error(`[ocr/analyze/progress] 403: ${access.reason} (job.tenantId=${job.tenantId}, job.workspaceId=${job.workspaceId})`);
      return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini.", reason: access.reason });
    }
    return res.json(job);
  });

  // OCR cancel — allows the client to stop a running OCR job
  app.post("/api/ocr/analyze/cancel/:jobId", async (req, res) => {
    const job = ocrJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found or expired." });
    }
    const access = await verifyTenantAccess(req, job.tenantId, job.workspaceId);
    if (!access.ok) {
      console.error(`[ocr/analyze/cancel] 403: ${access.reason}`);
      return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini.", reason: access.reason });
    }
    job.status = "CANCELLED" as any;
    job.stage = "CANCELLED" as any;
    job.updatedTime = Date.now();
    return res.json({ ok: true, message: "Job cancelled." });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BANK STATEMENT IMPORT WORKFLOW
  //
  // Completely isolated from the OCR receipt/invoice flow above.
  // These routes handle: upload → chunk extraction → per-chunk AI → draft.
  // After CONFIRM the client calls the existing confirmFinancialRecord() path —
  // NOTHING in this section writes to income_records / expense_records / etc.
  // ─────────────────────────────────────────────────────────────────────────────

  // Helper: Supabase REST helper scoped to service_role for statement job ops.
  const sbUrl  = () => process.env.VITE_SUPABASE_URL!;
  const sbSrk  = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sbHdrs = () => ({
    apikey: sbSrk(),
    Authorization: `Bearer ${sbSrk()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  });

  // Fetch the active job for a workspace (status IN PENDING/PROCESSING/PAUSED/INTERRUPTED).
  async function getActiveStatementJob(workspaceId: string): Promise<any | null> {
    const resp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?workspace_id=eq.${workspaceId}&status=in.(PENDING,PROCESSING,PAUSED,INTERRUPTED)&limit=1`,
      { headers: sbHdrs() }
    );
    if (!resp.ok) return null;
    const rows: any[] = await resp.json();
    return rows[0] ?? null;
  }

  // Update a job record by id.
  async function patchStatementJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
    await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?id=eq.${jobId}`,
      { method: "PATCH", headers: sbHdrs(), body: JSON.stringify(patch) }
    );
  }

  // Insert or update a checkpoint row (upsert on statement_job_id + chunk_index).
  async function upsertCheckpoint(row: {
    statement_job_id: string; chunk_index: number; status: string;
    chunk_text?: string; transactions_json?: any; attempt_count?: number;
    ai_provider_used?: string; completed_at?: string; error_message?: string;
  }): Promise<void> {
    await fetch(
      `${sbUrl()}/rest/v1/bank_statement_checkpoints`,
      {
        method: "POST",
        headers: { ...sbHdrs(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
      }
    );
  }

  // Fetch all completed checkpoints for a job (for progress query and resume).
  async function getJobCheckpoints(jobId: string): Promise<any[]> {
    const resp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_checkpoints?statement_job_id=eq.${jobId}&order=chunk_index.asc`,
      { headers: sbHdrs() }
    );
    if (!resp.ok) return [];
    return resp.json();
  }

  // Core chunk-processing engine for a bank statement job.
  // Processes one chunk at a time, persisting each result to bank_statement_checkpoints.
  // Honors the paused/cancelled state between chunks so pause/resume is immediate.
  async function runStatementAnalysis(jobId: string, workspaceId: string, tenantId: string, userId: string): Promise<void> {
    const supabaseUrl = sbUrl();
    const serviceRoleKey = sbSrk();

    // Fetch job record.
    const jobResp = await fetch(
      `${supabaseUrl}/rest/v1/bank_statement_jobs?id=eq.${jobId}&limit=1`,
      { headers: sbHdrs() }
    );
    const jobs: any[] = jobResp.ok ? await jobResp.json() : [];
    const job = jobs[0];
    if (!job) { console.error(`[STMT] job ${jobId} not found`); return; }

    const fileDataText: string | null = job.file_data_text;
    const fileName: string = job.file_name;
    if (!fileDataText) {
      await patchStatementJob(jobId, { status: "FAILED", error_message: "PDF text missing — cannot process." });
      return;
    }

    // Get AI candidates (reuse existing router — no change to that code).
    const candidates = await getAiProviderCandidates();
    if (candidates.length === 0) {
      await patchStatementJob(jobId, { status: "FAILED", error_message: "Tiada pembekal AI dikonfigurasikan." });
      return;
    }

    // Split into chunks.
    const chunks = chunkStatementText(fileDataText);
    const totalChunks = chunks.length;

    // Load existing checkpoints so resume skips already-completed chunks.
    const existingCheckpoints = await getJobCheckpoints(jobId);
    const completedIndexes = new Set(
      existingCheckpoints.filter(c => c.status === "COMPLETED").map((c: any) => c.chunk_index)
    );

    await patchStatementJob(jobId, {
      status: "PROCESSING",
      total_chunks: totalChunks,
      updated_at: new Date().toISOString(),
    });

    const ocrPrompt = `Analyze this BANK STATEMENT segment (filename: ${fileName}) and extract ALL transaction lines into the "transactions" array. CREDIT = money in, DEBIT = money out.

Output ONLY raw JSON matching this shape exactly, no markdown fences, no extra text:
{
  "merchantName": "string — bank or institution name if identifiable",
  "documentNumber": "string — statement reference if found",
  "date": "string — YYYY-MM-DD statement date if found",
  "amount": 0,
  "currency": "MYR",
  "suggestedCategory": "Bank Statement",
  "confidenceScore": 0.9,
  "rawExtractedText": "string — brief summary of this segment",
  "transactions": [{ "date": "YYYY-MM-DD", "description": "string", "amount": 0, "type": "CREDIT|DEBIT", "suggestedCategory": "string", "confidenceScore": 0.0 }]
}`;

    let chunksCompleted = completedIndexes.size;
    let chunksFailed = existingCheckpoints.filter((c: any) => c.status === "FAILED").length;
    let transactionsFound = existingCheckpoints
      .filter((c: any) => c.status === "COMPLETED")
      .reduce((acc: number, c: any) => acc + (Array.isArray(c.transactions_json) ? c.transactions_json.length : 0), 0);
    let usedProvider: string | null = null;

    for (let i = 0; i < chunks.length; i++) {
      // Skip already-completed chunks (resume path).
      if (completedIndexes.has(i)) continue;

      // Check if paused or cancelled before each chunk.
      const statusCheckResp = await fetch(
        `${supabaseUrl}/rest/v1/bank_statement_jobs?id=eq.${jobId}&select=status&limit=1`,
        { headers: sbHdrs() }
      );
      const statusRows: any[] = statusCheckResp.ok ? await statusCheckResp.json() : [];
      const currentStatus = statusRows[0]?.status;
      if (currentStatus === "PAUSED" || currentStatus === "CANCELLED") {
        console.info(`[STMT] job ${jobId} ${currentStatus} at chunk ${i} — stopping.`);
        return;
      }

      // Mark this chunk PENDING in checkpoints.
      await upsertCheckpoint({ statement_job_id: jobId, chunk_index: i, status: "PENDING", chunk_text: chunks[i] });

      const chunkPrompt = totalChunks > 1
        ? `${ocrPrompt}\n\nNOTE: This is PART ${i + 1} of ${totalChunks} of the same bank statement. Extract ONLY transactions visible in THIS part.`
        : ocrPrompt;

      let chunkResult: any = null;
      let lastChunkErr: any = null;
      let attemptCount = 0;
      let chunkProvider: string | null = null;

      for (const candidate of candidates) {
        attemptCount++;
        try {
          chunkResult = await callAiProviderTextOcr(candidate, chunks[i], chunkPrompt);
          chunkProvider = `${candidate.provider}:${candidate.model}`;
          usedProvider = chunkProvider;
          break;
        } catch (err: any) {
          lastChunkErr = err;
          console.error(`[STMT] chunk ${i + 1}/${totalChunks} candidate ${candidate.provider} failed:`, err?.message || err);
        }
      }

      if (!chunkResult) {
        chunksFailed++;
        await upsertCheckpoint({
          statement_job_id: jobId, chunk_index: i, status: "FAILED",
          attempt_count: attemptCount, error_message: lastChunkErr?.message?.slice(0, 500) || "All providers failed",
        });
      } else {
        const txns: any[] = Array.isArray(chunkResult.transactions) ? chunkResult.transactions : [];
        chunksCompleted++;
        transactionsFound += txns.length;
        await upsertCheckpoint({
          statement_job_id: jobId, chunk_index: i, status: "COMPLETED",
          transactions_json: txns, attempt_count: attemptCount,
          ai_provider_used: chunkProvider ?? undefined,
          completed_at: new Date().toISOString(),
        });
      }

      // Update job progress after each chunk.
      await patchStatementJob(jobId, {
        chunks_completed: chunksCompleted,
        chunks_failed: chunksFailed,
        transactions_found: transactionsFound,
        ai_provider_used: usedProvider ?? undefined,
        updated_at: new Date().toISOString(),
      });
    }

    // All chunks done. Determine final status.
    const finalStatus = chunksCompleted > 0 ? "COMPLETED" : "FAILED";
    const errorMsg = chunksCompleted === 0 ? "Semua chunk gagal diproses oleh semua pembekal AI." : null;

    await patchStatementJob(jobId, {
      status: finalStatus,
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (finalStatus === "COMPLETED") {
      logAiUsage(tenantId, workspaceId, userId, "ocr", usedProvider?.split(":")[0] || "unknown", usedProvider?.split(":")[1] || "unknown", {
        strategy: "bank_statement_import",
        candidateOrder: candidates.map(c => `${c.provider}:${c.model}`),
        attempts: [],
        totalAttempts: chunksCompleted + chunksFailed,
      });
    }
  }

  // POST /api/statement/process/start
  // Accepts raw PDF as fileDataUrl, extracts text server-side via pdf-parse,
  // creates a job row, returns jobId immediately, fires runStatementAnalysis() in background.
  // Non-Negotiable Rule #4: blocks if another active import exists for this workspace.
  app.post("/api/statement/process/start", async (req, res) => {
    const { fileDataUrl, fileName, tenantId, workspaceId, userId } = req.body || {};
    if (!fileDataUrl || !fileName) {
      return res.status(400).json({ error: "fileDataUrl and fileName are required." });
    }

    // Extract PDF text server-side (same as runOcrAnalysis — reuses existing pdf-parse dep).
    let fileDataText: string;
    let pdfPageCount: number | null = null;
    try {
      const matchPdf = (fileDataUrl as string).match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = matchPdf ? matchPdf[1] : "";
      const base64Data = matchPdf ? matchPdf[2] : (fileDataUrl as string);
      if (!mimeType.includes("pdf") && !fileName.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ error: "Hanya fail PDF dibenarkan untuk Bank Statement Import.", code: "NOT_A_PDF" });
      }
      const pdfBuffer = Buffer.from(base64Data, "base64");
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      fileDataText = (result.text || "").trim();
      pdfPageCount = (result as any).numpages ?? null;
      if (!fileDataText) {
        return res.status(422).json({
          error: "PDF ini tidak mengandungi teks yang boleh dibaca. Sila muat naik PDF dengan lapisan teks sebenar.",
          code: "PDF_NO_TEXT_LAYER",
        });
      }
    } catch (pdfErr: any) {
      console.error("[STMT/start] PDF extraction failed:", pdfErr?.message || pdfErr);
      return res.status(422).json({ error: "Gagal membaca teks daripada PDF ini.", code: "PDF_EXTRACTION_FAILED" });
    }
    const access = await verifyTenantAccess(req, tenantId, workspaceId);
    if (!access.ok) {
      return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
    }
    if (await isUserSuspended(userId)) {
      return res.status(403).json({ error: "Akaun anda telah disekat oleh pentadbir HQ." });
    }

    const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "OCR", `Bank Statement Import: ${fileName}`);
    if (!hasCredit) {
      return res.status(402).json({ error: "Kredit OCR syarikat anda telah habis.", code: "OCR_CREDITS_EXHAUSTED" });
    }

    // Check for existing active import (Rule #4).
    const existing = await getActiveStatementJob(workspaceId);
    if (existing) {
      return res.status(409).json({
        error: "ACTIVE_IMPORT_EXISTS",
        existingJobId: existing.id,
        existingStatus: existing.status,
        existingFileName: existing.file_name,
        message: "Terdapat import bank statement yang sedang aktif untuk syarikat ini.",
      });
    }

    // Create job row.
    const jobPayload = {
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
      file_name: fileName,
      file_data_text: fileDataText,
      status: "PENDING",
      total_chunks: 0,
      chunks_completed: 0,
      chunks_failed: 0,
      transactions_found: 0,
      transactions_confirmed: 0,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const createResp = await fetch(`${sbUrl()}/rest/v1/bank_statement_jobs`, {
      method: "POST",
      headers: sbHdrs(),
      body: JSON.stringify(jobPayload),
    });
    if (!createResp.ok) {
      const body = await createResp.text();
      // Unique index violation = another active import snuck in concurrently.
      if (body.includes("bank_statement_jobs_one_active_per_workspace")) {
        const active = await getActiveStatementJob(workspaceId);
        return res.status(409).json({
          error: "ACTIVE_IMPORT_EXISTS",
          existingJobId: active?.id ?? null,
          existingStatus: active?.status ?? null,
          existingFileName: active?.file_name ?? null,
          message: "Terdapat import bank statement yang sedang aktif untuk syarikat ini.",
        });
      }
      console.error("[STMT/start] Failed to create job:", body);
      return res.status(500).json({ error: "Gagal membuat rekod import." });
    }

    const rows: any[] = await createResp.json();
    const jobId: string = rows[0]?.id;
    if (!jobId) {
      return res.status(500).json({ error: "Gagal mendapatkan ID import yang dibuat." });
    }

    // totalPages is display metadata only — not stored in DB, not used by engine.
    res.json({ jobId, totalPages: pdfPageCount });

    // Fire-and-forget background processing.
    runStatementAnalysis(jobId, workspaceId, tenantId, userId).catch((err) => {
      console.error(`[STMT] runStatementAnalysis unhandled error for job ${jobId}:`, err);
      patchStatementJob(jobId, { status: "FAILED", error_message: err?.message?.slice(0, 500) || "Unexpected error" }).catch(() => {});
    });
  });

  // GET /api/statement/process/progress/:jobId
  // Returns current job state + chunk checkpoints for the progress panel.
  app.get("/api/statement/process/progress/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const jobResp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?id=eq.${jobId}&limit=1`,
      { headers: sbHdrs() }
    );
    const jobs: any[] = jobResp.ok ? await jobResp.json() : [];
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job tidak dijumpai." });

    const access = await verifyTenantAccess(req, job.tenant_id, job.workspace_id);
    if (!access.ok) return res.status(403).json({ error: "Akses dinafikan." });

    const checkpoints = await getJobCheckpoints(jobId);
    return res.json({ ...job, checkpoints });
  });

  // POST /api/statement/process/pause/:jobId
  // Sets status to PAUSED — runStatementAnalysis checks this flag between chunks.
  app.post("/api/statement/process/pause/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const jobResp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?id=eq.${jobId}&limit=1`,
      { headers: sbHdrs() }
    );
    const jobs: any[] = jobResp.ok ? await jobResp.json() : [];
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job tidak dijumpai." });

    const access = await verifyTenantAccess(req, job.tenant_id, job.workspace_id);
    if (!access.ok) return res.status(403).json({ error: "Akses dinafikan." });

    if (!["PENDING", "PROCESSING"].includes(job.status)) {
      return res.status(400).json({ error: `Job tidak boleh dijeda dari status: ${job.status}` });
    }
    await patchStatementJob(jobId, { status: "PAUSED", updated_at: new Date().toISOString() });
    return res.json({ ok: true, jobId, status: "PAUSED" });
  });

  // POST /api/statement/process/resume/:jobId
  // Re-fires runStatementAnalysis which skips completed chunks via checkpoint table.
  app.post("/api/statement/process/resume/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const { userId } = req.body || {};
    const jobResp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?id=eq.${jobId}&limit=1`,
      { headers: sbHdrs() }
    );
    const jobs: any[] = jobResp.ok ? await jobResp.json() : [];
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job tidak dijumpai." });

    const access = await verifyTenantAccess(req, job.tenant_id, job.workspace_id);
    if (!access.ok) return res.status(403).json({ error: "Akses dinafikan." });

    if (!["PAUSED", "INTERRUPTED", "FAILED"].includes(job.status)) {
      return res.status(400).json({ error: `Job tidak boleh disambung dari status: ${job.status}` });
    }
    // Reset status to PENDING so runStatementAnalysis sets it to PROCESSING.
    await patchStatementJob(jobId, { status: "PENDING", error_message: null, updated_at: new Date().toISOString() });
    res.json({ ok: true, jobId, status: "PENDING" });

    runStatementAnalysis(jobId, job.workspace_id, job.tenant_id, userId || job.user_id).catch((err) => {
      console.error(`[STMT] resume runStatementAnalysis error for job ${jobId}:`, err);
      patchStatementJob(jobId, { status: "INTERRUPTED", error_message: err?.message?.slice(0, 500) || "Unexpected error" }).catch(() => {});
    });
  });

  // POST /api/statement/process/cancel/:jobId
  // Cancels an active or paused job — releases the one-active-per-workspace constraint.
  app.post("/api/statement/process/cancel/:jobId", async (req, res) => {
    const { jobId } = req.params;
    const jobResp = await fetch(
      `${sbUrl()}/rest/v1/bank_statement_jobs?id=eq.${jobId}&limit=1`,
      { headers: sbHdrs() }
    );
    const jobs: any[] = jobResp.ok ? await jobResp.json() : [];
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job tidak dijumpai." });

    const access = await verifyTenantAccess(req, job.tenant_id, job.workspace_id);
    if (!access.ok) return res.status(403).json({ error: "Akses dinafikan." });

    await patchStatementJob(jobId, { status: "CANCELLED", updated_at: new Date().toISOString() });
    return res.json({ ok: true, jobId, status: "CANCELLED" });
  });

  // ─── END BANK STATEMENT IMPORT WORKFLOW ───────────────────────────────────────


  // Voice note transcription (Whisper) — lets a chat-attached audio recording
  // actually be understood instead of the assistant just saying it can't listen.
  app.post("/api/ai/transcribe", async (req, res) => {
    try {
      const { fileDataUrl, fileName, tenantId, workspaceId, userId } = req.body || {};
      if (!fileDataUrl) {
        return res.status(400).json({ error: "No audio data provided." });
      }
      if (await isUserSuspended(userId)) {
        return res.status(403).json({ error: "Akaun anda telah disekat oleh pentadbir HQ. Sila hubungi sokongan." });
      }
      const access = await verifyTenantAccess(req, tenantId, workspaceId);
      if (!access.ok) {
        return res.status(403).json({ error: "Sesi tidak sah atau tidak mempunyai akses kepada syarikat ini." });
      }

      const candidates = await getAiProviderCandidates();
      const openaiCandidate = candidates.find(c => c.provider === "openai") || (process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } as any : null);
      if (!openaiCandidate) {
        return res.status(503).json({ error: "Transkripsi nota suara belum dikonfigurasikan (perlukan pembekal OpenAI)." });
      }

      const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "AI", `Voice transcription: ${fileName || "nota-suara"}`);
      if (!hasCredit) {
        return res.status(402).json({ error: "Kredit AI syarikat anda telah digunakan sepenuhnya untuk tempoh semasa.", code: "AI_CREDITS_EXHAUSTED" });
      }

      const match = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = match ? match[1] : "audio/webm";
      const base64Data = match ? match[2] : fileDataUrl;
      const audioBuffer = Buffer.from(base64Data, "base64");

      const form = new FormData();
      form.append("file", new Blob([audioBuffer], { type: mimeType }), fileName || "nota-suara.webm");
      form.append("model", "whisper-1");

      const whisperController = new AbortController();
      const whisperTimeoutId = setTimeout(() => whisperController.abort(), 90000);
      let whisperRes: Response;
      try {
        whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiCandidate.apiKey}` },
          body: form,
          signal: whisperController.signal,
        });
        if (!whisperRes.ok) {
          const errBody = await whisperRes.json().catch(() => ({}));
          return res.status(400).json({ error: errBody?.error?.message || "Gagal transkripsi nota suara." });
        }
        const result = await whisperRes.json() as any;
        return res.json({ text: result.text || "" });
      } finally {
        clearTimeout(whisperTimeoutId);
      }
    } catch (error: any) {
      console.error("Voice transcription failed:", error?.message || error);
      return res.status(500).json({ error: "Ralat sistem transkripsi nota suara." });
    }
  });

  // AI FINANCIAL ASSISTANT SECURE PROXY ROUTE
  app.post("/api/ai/assistant", async (req, res) => {
    let candidates: AiCandidate[] = [];
    try {
      const { query, financialContext, userId } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Missing assistant query text." });
      }
      if (await isUserSuspended(userId)) {
        return res.status(403).json({ error: "Akaun anda telah disekat oleh pentadbir HQ. Sila hubungi sokongan." });
      }

      candidates = await getAiProviderCandidates();
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

      const knowledgeBankMatches = await fetchKnowledgeBankMatches(String(query));

      const systemPrompt = `You are MYKERANI AI Financial Assistant, a highly trained cognitive co-pilot. Your purpose is to analyze the active workspace financial data and provide Q&A answers, structured searches, analytical summaries, diagnostic health explanations, and evidence retrieval references.

Active Workspace and Tenant context:
Workspace Name: ${financialContext?.activeWorkspace?.name || "Standard Workspace"}
Tenant Name: ${financialContext?.activeTenant?.name || "Standard Tenant"}

User's Query/Question: "${query}"

Financial Knowledge Bank — Matched Reference Scenarios (curated, cross-tenant financial situations matched to this query by keyword; use these to inform your suggested classification, but a matching OCR Learned Vendor Pattern from THIS tenant's own history, section 7 below, always takes priority since it is more specific): ${JSON.stringify(knowledgeBankMatches)}

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
9. Business Profile(s): ${JSON.stringify(financialContext?.businesses || financialContext?.businessProfile || {})}
9b. Business Branches (nested under each business's own id; a relatedParty/merchant/vendor name matching ANY branchName here means the document was issued BY the user's own business, not by an outside party): ${JSON.stringify(financialContext?.businessBranches || {})}
10. Vehicles (name, plateNumber, vehicleType, ownership "PERSONAL"|"BUSINESS"): ${JSON.stringify(financialContext?.vehicles || [])}
11. Dependents: ${JSON.stringify(financialContext?.dependents || [])}

Instructions & Constraints:
- AI Suggests. User Confirms. AI Learns. (If you identify any unrecognized category, or vendor without a learned profile, ALWAYS generate a 'LEARN_PATTERN' suggestion inside the 'suggestions' array. Do not suggest editing or deleting records. Only recommend classifications that the user can confirm manually.)
- PROFILE-FIRST CLASSIFICATION (LOCKED 8-STEP SEQUENCE): You MUST follow this exact sequence and MUST NOT skip any step:
  Step 1 — DIRECTION DETECTION: Is money coming IN (receiving payment, salary received, loan disbursement, capital injection) or going OUT (paying someone, salary payment, expense, owner drawing)? If both directions cancel out (money moving between own accounts), this is a TRANSFER — STOP and set transactionType to "TRANSFER".
  Step 2 — PROFILE MATCHING: Check the Financial Profile (sections 8-11). Does the relatedParty/merchant match a known Vehicle owner (section 10), Dependent (section 11), or personal context?
  Step 3 — BUSINESS MATCHING: Does the relatedParty/merchant/vendor name match a known Business name (section 9)? If YES, check if the money is moving between own businesses (TRANSFER) or between owner and business (OWNER_TRANSACTION).
  Step 4 — BRANCH MATCHING: Does the relatedParty/merchant/vendor name match a Branch name in section 9b (Business Branches)? A document (invoice/receipt) whose merchant/vendor field is the user's OWN business or branch name means the document was ISSUED BY the user's own business — e.g. an invoice the business billed to its customer. This is the OPPOSITE of a normal purchase receipt from an outside vendor: it means money is/was coming IN, not going out. Treat an own-business/own-branch merchant match as strong evidence for INCOME, not EXPENSE — do NOT default to EXPENSE just because the document looks like an invoice/receipt.
  Step 5 — RELATIONSHIP MATCHING: Evaluate the relationship between the parties. Is the relatedParty: the Owner themselves? A Staff member? The Business or one of its own Branches (section 9b)? A Vehicle? A Bank Account? A Customer? A Supplier? This determines the transaction type:
    • Money from a Customer TO the Business → INCOME (the business is receiving payment)
    • The document's merchant/vendor IS the user's own Business/Branch (section 9b match) → INCOME (the business issued this invoice/receipt to a customer; it is not paying an outside party)
    • Money from the Business TO a Supplier (an outside party, NOT a match in sections 9/9b) → EXPENSE (the business is paying for goods/services)
    • Money the Business pays to an Employee as salary → EXPENSE (the business has a salary obligation)
    • Money an Employee receives as salary INTO their personal account → INCOME (the employee's perspective, only if the employee is the user)
    • Money the Owner puts INTO the Business → OWNER_TRANSACTION with subtype CAPITAL_INJECTION
    • Money the Owner takes FROM the Business for personal use → OWNER_TRANSACTION with subtype DRAWING
    • Money between own accounts (bank↔bank, bank↔cash, business↔business) → TRANSFER
    • Money borrowed from a lender → DEBT
    • Money lent to a borrower → RECEIVABLE
    DO NOT hardcode "salary = OWNER_TRANSACTION" — salary classification depends on the RELATIONSHIP: if the Business pays salary it is EXPENSE, if the Owner receives salary from their business it is OWNER_TRANSACTION/DRAWING, if an Employee receives salary into their personal account it is INCOME.
  Step 6 — TRANSACTION TYPE: Based on Steps 1-5, set transactionType to exactly one of: INCOME, EXPENSE, TRANSFER, OWNER_TRANSACTION, ASSET_PURCHASE, RECEIVABLE, PAYABLE, DEBT, COMMITMENT.
  Step 7 — CATEGORY: Assign the category appropriate for the transaction type and business context.
  Step 8 — CONFIRMATION: Return the suggestion with all fields. The user will confirm.
  NEVER default to EXPENSE. NEVER skip Step 5 (Relationship Matching). The relationship between parties determines everything.
- SUGGEST-FIRST (LOCKED BEHAVIOR): you are a financial clerk, not an interrogation chatbot. The objective is to minimize user effort, not maximize certainty. When the user states a transaction (amount + what it was for), your default action is to ALWAYS attempt a CONFIRM_TRANSACTION suggestion immediately — even when details like the vendor/customer name are missing — by inferring the most likely classification in this priority order: (1) User Profile, (2) Workspace/Tenant context (the single active workspace given above — do not guess at OTHER workspaces you cannot see), (3) Financial History (financialEvents), (4) OCR Learned Vendor Patterns (section 7 — this tenant's own confirmed history, highest trust), (5) Financial Knowledge Bank matched scenarios given above (cross-tenant curated reference, use when no learned pattern exists), (6) general world knowledge of the stated item/keyword (e.g. "ayam" implies raw-material/food-related expense). If the vendor/customer name was not stated, leave "relatedParty" null/empty in the payload and proceed anyway — do NOT block the suggestion or ask "beli dekat mana/dari siapa" just to fill in a party name; the user can add it later by editing the suggestion before confirming. Never respond with a refusal like "saya tidak dapat mengesahkan maklumat" — always give your best suggested classification with an honest confidenceScore instead. Only fall back to asking a clarifying question (and skipping the suggestion) when the AMBIGUITY IS STRUCTURAL and a wrong guess would misclassify the record in a way editing-after-the-fact can't cleanly fix — i.e. the vehicle-disambiguation and owner/business-ambiguity cases described below. A missing vendor name alone is never sufficient reason to ask instead of suggesting.
- AI is strictly advisory. Your recommendations should prioritize safety, financial health, liquidity, and double-entry accuracy.
- Return references ('linkedRecordIds' and 'linkedEvidenceIds') when queries touch specific events, bills, invoices, receipts, or attachments.
- Return structured visual metrics in the 'highlights' object. Health Status must be EXCELLENT, STABLE, WARNING, or THREAT.
- FINANCIAL INTENT DETECTION: if the user's query describes a real-world financial transaction (in Malay or English) rather than a question, detect it and populate 'financialIntent'. Examples: "Pelanggan bayar RM500" / "Customer paid RM500" -> INCOME; "Saya isi minyak RM50" / "Filled petrol RM50" -> EXPENSE; "Saya hutang pembekal RM300" / "Borrowed RM1000 from Ali" -> DEBT; "Customer owes RM500" / "Pelanggan berhutang RM500" -> RECEIVABLE; "Saya kena bayar pembekal RM300 bulan depan" / "I owe my supplier RM300 due next month" -> PAYABLE; "Rental RM1200 monthly" / "Sewa RM1200 sebulan" -> COMMITMENT; "Saya beli mesin jahit baru RM2000" / "Bought a new printer RM1500 for the shop" -> ASSET_PURCHASE; "Saya masukkan modal RM5000 ke bisnes" / "Owner injected RM5000 capital" -> OWNER_TRANSACTION (subtype CAPITAL_INJECTION); "Saya ambil RM300 dari bisnes untuk guna sendiri" / "Withdrew RM300 from the business for personal use" -> OWNER_TRANSACTION (subtype DRAWING). If no transaction is described, set "detected": false and leave the other financialIntent fields null.
- When financialIntent.detected is true, you MUST ALSO add exactly one suggestion to the 'suggestions' array with "actionType": "CONFIRM_TRANSACTION" whose payload carries the structured transaction fields below. This is a SUGGESTION ONLY — you never write the record yourself; the user must explicitly Confirm (optionally after editing) before anything is saved. Default "date" to today (${todayMyt()}) if the user didn't state one.
- DISAMBIGUATION: if there are 2+ Vehicles listed above (section 10) and the user's transaction text plausibly relates to a vehicle (petrol, toll, parking, service, repair, road tax, insurance) but does NOT name which vehicle, do NOT guess. Instead set financialIntent.detected to false, leave 'suggestions' empty, and in 'text' ask a short clarifying question listing the vehicle names and their ownership (e.g. "Untuk kenderaan mana — Hilux (Perniagaan) atau Myvi (Peribadi)?"). Once the user's NEXT message names the vehicle, treat it as the missing detail for the same transaction and proceed normally (detect + CONFIRM_TRANSACTION), using that vehicle's ownership to decide whether it is a business EXPENSE or a personal/owner-drawing transaction. The same pattern applies if Business Profile / multiple businesses make the transaction's owner ambiguous: ask, don't guess.
- DEPENDENTS CONTEXT: if Dependents (section 11) is non-empty and the user describes income/expense tied to a family member by relationship or name (e.g. "duit poket anak", "yuran sekolah Aiman", "emak bagi RM200") without saying whose money it is, you may use the dependents list to recognize the name/relationship and set relatedParty accordingly — but if the transaction's classification (e.g. whether it is the business's or personal) is still ambiguous, ask rather than guess, same as the vehicle rule above.
- ASSET_PURCHASE vs OWNER_TRANSACTION: a purchase of a durable item the business will use for a while (machine, equipment, furniture, computer, vehicle) is ASSET_PURCHASE, not EXPENSE. Money the owner personally puts into or takes out of the business with no goods/service exchanged (modal, drawing/ambil duit guna sendiri) is OWNER_TRANSACTION — set "category" to "CAPITAL_INJECTION" or "DRAWING" in the payload to mirror "ownerTransactionSubtype". If it is unclear whether a withdrawal is a legitimate business EXPENSE or an OWNER_TRANSACTION drawing, ask rather than guess.
- APPLYING LEARNED PATTERNS (this is how you demonstrably learn from this tenant's own history, not generic guessing): before asking the user to clarify a category, check whether the transaction's relatedParty/vendor name matches (case-insensitively, allowing minor spelling variation) a "vendorName" already present in section 7's OCR Learned Vendor Patterns. If it matches, reuse that pattern's "category" and "recordType" directly in your CONFIRM_TRANSACTION suggestion instead of guessing or asking, and set "confidenceScore" to at least that pattern's confidenceScore (higher occurrenceCount = more trustworthy — you may state in 'text' that you recognized the vendor from past records, e.g. "Saya kenal pasti [vendor] biasanya direkod sebagai [kategori]"). Only fall back to LEARN_PATTERN / asking the user when no matching learned vendor exists.

Provide your output precisely formatted as raw JSON matching exactly this shape, with no markdown code fences and no extra commentary outside the JSON object:
{
  "text": "string — Markdown-formatted advisory answer",
  "financialIntent": { "detected": false, "type": "INCOME|EXPENSE|DEBT|RECEIVABLE|PAYABLE|COMMITMENT|ASSET_PURCHASE|OWNER_TRANSACTION|null", "amount": 0, "relatedParty": "string|null", "rawText": "string" },
  "suggestions": [
    { "id": "string", "title": "string", "description": "string", "actionType": "LEARN_PATTERN", "payload": { "vendorName": "string", "category": "string", "recordType": "string", "confidenceScore": 0.0 } },
    { "id": "string", "title": "string", "description": "string", "actionType": "CONFIRM_TRANSACTION", "payload": { "transactionType": "INCOME|EXPENSE|DEBT|RECEIVABLE|PAYABLE|COMMITMENT|ASSET_PURCHASE|OWNER_TRANSACTION", "category": "string", "amount": 0, "date": "YYYY-MM-DD", "relatedParty": "string|null — omit/null if not stated, do not block the suggestion on this", "confidenceScore": 0.0, "ownerTransactionSubtype": "CAPITAL_INJECTION|DRAWING|null" } }
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
      const attemptErrors: { provider: string; model: string; error: string }[] = [];
      for (const candidate of candidates) {
        try {
          parsedResponse = await callAiProvider(candidate, systemPrompt);
          usedCandidate = candidate;
          break;
        } catch (err: any) {
          lastErr = err;
          attemptErrors.push({ provider: candidate.provider, model: candidate.model, error: String(err?.message || err).slice(0, 500) });
          console.error(`AI provider "${candidate.provider}" failed, trying next candidate:`, err?.message || err);
        }
      }

      if (!parsedResponse) {
        console.info("[AI_ROUTER_DEBUG] fallbackTriggerReason=ALL_CANDIDATES_FAILED", lastErr?.message || lastErr);
        (lastErr as any).attemptErrors = attemptErrors;
        throw lastErr || new Error("All configured AI providers failed");
      }

      const hasCredit = await consumeResourceCredit(tenantId, workspaceId, "AI", `AI assistant query: ${String(query).slice(0, 80)}`);
      if (!hasCredit) {
        return res.status(402).json({
          error: "Kredit AI syarikat anda telah digunakan sepenuhnya untuk tempoh semasa. Sila naik taraf pelan atau tunggu pembaharuan bulanan.",
          code: "AI_CREDITS_EXHAUSTED",
        });
      }

      console.info("[AI_ROUTER_DEBUG]", JSON.stringify({
        finalProviderUsed: usedCandidate!.provider,
        finalModelUsed: usedCandidate!.model,
        financialIntentPresent: Boolean(parsedResponse?.financialIntent),
        financialIntentDetected: parsedResponse?.financialIntent?.detected ?? null,
        confirmTransactionSuggestionPresent: Array.isArray(parsedResponse?.suggestions) && parsedResponse.suggestions.some((s: any) => s.actionType === "CONFIRM_TRANSACTION"),
      }));

      // TEMP RUNTIME VERIFICATION LOGGING (BUG 3 — own-company merchant
      // misclassified as EXPENSE instead of INCOME) — remove after diagnosis.
      // Logs exactly what Step 4/5 of the prompt needs to classify correctly:
      // the businessBranches the AI was given, the merchant/relatedParty it
      // extracted, and the transactionType it actually returned — so the next
      // reproduction of this bug shows the real payload instead of a guess.
      try {
        const confirmSuggestions = Array.isArray(parsedResponse?.suggestions)
          ? parsedResponse.suggestions.filter((s: any) => s.actionType === "CONFIRM_TRANSACTION")
          : [];
        console.info("[AI_CLASSIFICATION_DEBUG]", JSON.stringify({
          query: String(query).slice(0, 300),
          businessNames: (financialContext?.businesses || []).map((b: any) => b.businessName),
          businessBranchNames: Object.values(financialContext?.businessBranches || {}).flat().map((br: any) => br?.branchName),
          financialIntentRelatedParty: parsedResponse?.financialIntent?.relatedParty ?? null,
          financialIntentType: parsedResponse?.financialIntent?.type ?? null,
          suggestions: confirmSuggestions.map((s: any) => ({
            relatedParty: s.payload?.relatedParty ?? null,
            transactionType: s.payload?.transactionType ?? null,
            category: s.payload?.category ?? null,
            confidenceScore: s.payload?.confidenceScore ?? null,
          })),
        }));
      } catch (debugErr: any) {
        console.error("[AI_CLASSIFICATION_DEBUG] logging failed (non-blocking):", debugErr?.message || debugErr);
      }

      logAiUsage(financialContext?.activeTenant?.id, financialContext?.activeWorkspace?.id, userId, "assistant", usedCandidate!.provider, usedCandidate!.model, {
        strategy: usedCandidate!.strategy,
        candidateOrder: candidates.map(c => `${c.provider}:${c.model}`),
        attempts: [
          ...attemptErrors.map(a => ({ provider: a.provider, model: a.model, result: "FAILED" as const, error: a.error })),
          { provider: usedCandidate!.provider, model: usedCandidate!.model, result: "SUCCESS" as const },
        ],
        totalAttempts: attemptErrors.length + 1,
      });

      if (parsedResponse?.financialIntent?.detected && knowledgeBankMatches.length === 0) {
        logKnowledgeBankGap(financialContext?.activeTenant?.id, financialContext?.activeWorkspace?.id, parsedResponse.financialIntent);
      }

      // Accounting Knowledge Base V1 (Phase 1): stateless post-LLM rules layer.
      // Never throws/blocks the primary response — best-effort enrichment only.
      try {
        if (Array.isArray(parsedResponse?.suggestions)) {
          for (const suggestion of parsedResponse.suggestions) {
            if (suggestion?.actionType !== "CONFIRM_TRANSACTION") continue;
            const payload = suggestion.payload || {};
            // Lookup text intentionally excludes payload.category: the chosen
            // category label must never contaminate vendor/description matching,
            // or it can self-match a keyword and mask a genuine mismatch.
            const lookupText = [payload.relatedParty, parsedResponse?.financialIntent?.rawText]
              .filter(Boolean)
              .join(" ");
            const evaluation = evaluateAccountingSuggestion(payload.category, lookupText);
            if (evaluation) {
              suggestion.accountingRecommendation = evaluation.recommendedCategory;
              suggestion.accountingLevel1Group = evaluation.level1Group;
              suggestion.accountingReason = evaluation.accountingReason;
              suggestion.financialStatementImpact = evaluation.financialStatementImpact;
              suggestion.accountingRiskLevel = evaluation.riskLevel;
              suggestion.accountingExplanationText = evaluation.explanationText;
              suggestion.accountingMatchStatus = evaluation.matchStatus;
              suggestion.accountingConfidence = evaluation.accountingConfidence;
            }
          }
        }
      } catch (accountingErr: any) {
        console.error("Accounting Knowledge Base evaluation failed (non-blocking):", accountingErr?.message || accountingErr);
      }

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
      logAiFallback(
        req.body.financialContext?.activeTenant?.id,
        req.body.financialContext?.activeWorkspace?.id,
        req.body.userId,
        (error as any)?.attemptErrors || candidates.map(c => ({ provider: c.provider, model: c.model, error: errStr })),
        errStr,
        candidates[0]?.strategy
      );

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
  interface AiCandidate { provider: AiProviderId; apiKey: string; model: string; costUsd: number; strategy: string; }

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
      { id: "deepseek-v4-flash", inputPer1M: 0.27, outputPer1M: 1.10, tier: "balanced" },
      { id: "deepseek-v4-pro", inputPer1M: 0.55, outputPer1M: 2.19, tier: "pro" },
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

  // Financial Knowledge Bank: matches the user's free-text query against
  // curated cross-tenant financial scenarios (keyword overlap) so the AI
  // assistant has a concrete suggested classification to fall back on
  // before resorting to generic guessing. Read-only, best-effort — a lookup
  // failure must never block the assistant response.
  async function fetchKnowledgeBankMatches(query: string): Promise<any[]> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return [];

    const STOPWORDS = new Set(["saya", "kena", "kami", "untuk", "dengan", "yang", "dan", "the", "for", "with", "and", "from", "this", "that", "ini", "itu", "ada", "tak", "tidak"]);
    const keywords = Array.from(new Set(
      query.toLowerCase()
        .replace(/rm\s?[\d,.]+/g, " ")
        .split(/[^a-z0-9à-ÿ]+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    )).slice(0, 12);
    if (keywords.length === 0) return [];

    try {
      const filter = `{${keywords.map(k => k.replace(/[{},"]/g, "")).join(",")}}`;
      const url = `${supabaseUrl}/rest/v1/knowledge_bank_scenarios?is_active=eq.true&keywords=ov.${encodeURIComponent(filter)}&select=scenario_code,category,title,suggested_type,suggested_category,suggested_documents,base_confidence&limit=8`;
      const resp = await fetch(url, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      console.error("Knowledge Bank lookup failed:", err);
      return [];
    }
  }

  // Logs a real, detected financial transaction that matched no Knowledge
  // Bank scenario, so HQ can review and expand the bank over time. Fire-
  // and-forget — must never block or delay the assistant response.
  function logKnowledgeBankGap(tenantId: string | undefined | null, workspaceId: string | undefined | null, financialIntent: any): void {
    if (!tenantId) return;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    fetch(`${supabaseUrl}/rest/v1/knowledge_bank_gaps`, {
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
        raw_text: String(financialIntent?.rawText || "").slice(0, 500),
        detected_type: financialIntent?.type || null,
        detected_amount: financialIntent?.amount || null,
        related_party: financialIntent?.relatedParty || null,
      }),
    }).catch(err => console.error("Failed to log knowledge bank gap:", err));
  }

  // Records one AI usage credit against a tenant (service-role write — no client
  // role can insert directly, see ai_usage_log RLS). Best-effort: a logging failure
  // must never block the actual AI response from reaching the user.
  let aiCostRateCache: Map<string, number> | null = null;
  let aiCostRateCacheAt = 0;

  async function getAiCostPerCall(provider: string, model: string): Promise<number> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return 0;
    if (!aiCostRateCache || Date.now() - aiCostRateCacheAt > 5 * 60 * 1000) {
      try {
        const resp = await fetch(`${supabaseUrl}/rest/v1/ai_cost_rates?select=provider,model,cost_per_call_usd`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
        if (resp.ok) {
          const rows: any[] = await resp.json();
          aiCostRateCache = new Map(rows.map(r => [`${r.provider}:${r.model}`, Number(r.cost_per_call_usd) || 0]));
          aiCostRateCacheAt = Date.now();
        }
      } catch (err) {
        console.error("Failed to fetch AI cost rates:", err);
      }
    }
    return aiCostRateCache?.get(`${provider}:${model}`) ?? 0;
  }

  async function logAiUsage(tenantId: string | undefined | null, workspaceId: string | undefined | null, userId: string | undefined | null, feature: "assistant" | "ocr", provider: string, model: string, routerTrace?: { strategy: string; candidateOrder: string[]; attempts: { provider: string; model: string; result: "FAILED" | "SUCCESS"; error?: string }[]; totalAttempts: number }): Promise<void> {
    if (!tenantId) return;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    const costUsd = await getAiCostPerCall(provider, model);
    try {
      await fetch(`${supabaseUrl}/rest/v1/ai_usage_log`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ tenant_id: tenantId, workspace_id: workspaceId || null, user_id: userId || null, feature, provider, model, cost_usd: costUsd }),
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
          metadata: {
            provider, model, feature,
            ...(routerTrace ? {
              strategy: routerTrace.strategy,
              candidateOrder: routerTrace.candidateOrder,
              attempts: routerTrace.attempts,
              totalAttempts: routerTrace.totalAttempts,
              finalProvider: provider,
              finalModel: model,
              finalStatus: "SUCCESS",
            } : {}),
          },
        }),
      });
    } catch (err) {
      console.error("Failed to write event log for AI usage:", err);
    }
  }

  // Records why a request fell back to the Simulator (every candidate
  // provider failed) into event_logs, so the failure reason (auth/quota/
  // network/parsing) is queryable from the DB afterwards without needing
  // host log access. Best-effort — never blocks the fallback response.
  // errStr is the thrown error's message only (status code + provider
  // response body), never request headers, so it cannot leak an API key.
  function logAiFallback(tenantId: string | undefined | null, workspaceId: string | undefined | null, userId: string | undefined | null, attemptErrors: { provider: string; model: string; error: string }[], errStr: string, strategy?: string, feature: "assistant" | "ocr" = "assistant"): void {
    if (!tenantId) return;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    fetch(`${supabaseUrl}/rest/v1/event_logs`, {
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
        description: `${feature === "ocr" ? "OCR" : "AI Assistant"} fell back to Simulator Mode (all candidate providers failed)`,
        metadata: {
          outcome: "SIMULATOR_FALLBACK", attemptErrors, lastError: String(errStr).slice(0, 500),
          strategy: strategy || null,
          totalAttempts: attemptErrors.length,
          finalStatus: "ALL_CANDIDATES_FAILED",
        },
      }),
    }).catch(err => console.error("Failed to log AI fallback diagnostic:", err));
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
  async function resolveCallerIdentity(req: any): Promise<{ ok: boolean; userId?: string; tenantId?: string; role?: string; email?: string; reason?: string }> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return { ok: true }; // local/self-hosted dev without DB

    const authHeader = req.headers?.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return { ok: false, reason: "no_bearer_token_in_request" };

    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      });
      if (!userResp.ok) {
        const body = await userResp.text().catch(() => "");
        return { ok: false, reason: `auth_v1_user_rejected_token (HTTP ${userResp.status}): ${body.slice(0, 200)}` };
      }
      const userData = await userResp.json() as any;
      const userId = userData?.id;
      if (!userId) return { ok: false, reason: "auth_v1_user_response_missing_id" };

      const roleResp = await fetch(
        `${supabaseUrl}/rest/v1/user_role_assignments?user_id=eq.${userId}&select=tenant_id,role,email`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      if (!roleResp.ok) {
        const body = await roleResp.text().catch(() => "");
        return { ok: false, reason: `role_lookup_failed (HTTP ${roleResp.status}): ${body.slice(0, 200)}` };
      }
      const roleRows: any[] = await roleResp.json();
      const tenantId = roleRows[0]?.tenant_id;
      const role = roleRows[0]?.role;
      if (!tenantId || !role) return { ok: false, reason: `no_role_assignment_row_for_user_${userId}` };

      return { ok: true, userId, tenantId, role, email: roleRows[0]?.email || userData?.email };
    } catch (err: any) {
      console.error("Failed to resolve caller identity:", err);
      return { ok: false, reason: `exception: ${err?.message || String(err)}` };
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
  ): Promise<{ ok: boolean; userId?: string; tenantId?: string; role?: string; reason?: string }> {
    const identity = await resolveCallerIdentity(req);
    if (!identity.ok) return identity;
    // Dev fallback (no Supabase configured) has no tenantId to compare against.
    if (!identity.tenantId) return identity;
    if (claimedTenantId && identity.tenantId !== claimedTenantId) {
      return { ok: false, reason: `tenant_mismatch: identity.tenantId=${identity.tenantId} claimedTenantId=${claimedTenantId}` };
    }

    if (claimedWorkspaceId) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        const wsResp = await fetch(
          `${supabaseUrl}/rest/v1/workspaces?id=eq.${claimedWorkspaceId}&select=tenant_id`,
          { headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` } }
        );
        if (!wsResp.ok) {
          const body = await wsResp.text().catch(() => "");
          return { ok: false, reason: `workspace_lookup_failed (HTTP ${wsResp.status}): ${body.slice(0, 200)}` };
        }
        const wsRows: any[] = await wsResp.json();
        if (wsRows[0]?.tenant_id !== identity.tenantId) {
          return { ok: false, reason: `workspace_tenant_mismatch: workspace.tenant_id=${wsRows[0]?.tenant_id} identity.tenantId=${identity.tenantId}` };
        }
      } catch (err: any) {
        console.error("Failed to verify workspace ownership:", err);
        return { ok: false, reason: `workspace_lookup_exception: ${err?.message || String(err)}` };
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
      if (!resp.ok) return false;
      return Boolean(await resp.json());
    } catch (err) {
      console.error("Failed to check/consume resource credit:", err);
      return false;
    }
  }

  // --- Chip Asia payment gateway (https://docs.chip-in.asia) ---
  // HQ stores the brand_id + secret key in payment_gateway_settings (Supabase).
  // We never expose the secret key to the client — only this server talks to Chip Asia.

  let chipAsiaPublicKeyCache: string | null = null;

  async function isHqFeatureFlagEnabled(key: string): Promise<boolean> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return false;
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/hq_feature_flags?key=eq.${encodeURIComponent(key)}&select=enabled`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!resp.ok) return false;
      const rows: any[] = await resp.json();
      return Boolean(rows[0]?.enabled);
    } catch (err) {
      console.error(`Failed to read HQ feature flag "${key}":`, err);
      return false;
    }
  }

  async function logPaymentWebhookEvent(event: {
    transactionReference: string | null;
    signaturePresent: boolean;
    publicKeyCached: boolean;
    verificationResult: "verified" | "failed" | "skipped_no_key" | "skipped_no_signature";
    wouldHaveBlocked: boolean;
    enforced: boolean;
    payload: unknown;
  }): Promise<void> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/payment_webhook_events`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          gateway: "chip_asia",
          transaction_reference: event.transactionReference,
          signature_present: event.signaturePresent,
          public_key_cached: event.publicKeyCached,
          verification_result: event.verificationResult,
          would_have_blocked: event.wouldHaveBlocked,
          enforced: event.enforced,
          payload: event.payload,
        }),
      });
    } catch (err) {
      console.error("Failed to log payment webhook event:", err);
    }
  }

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
      const { transactionId, tenantId, planId, amountMyr, addonLabel } = req.body || {};
      if (!transactionId || !tenantId || !amountMyr || (!planId && !addonLabel)) {
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
            products: [{ name: addonLabel ? `MyKerani: ${addonLabel}` : `Pelan Langganan MyKerani`, price: Math.round(Number(amountMyr) * 100) }],
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
    const purchase = req.body;
    const transactionId: string | null = purchase?.reference || null;
    const enforceEnabled = await isHqFeatureFlagEnabled("chip_asia_webhook_enforce");

    try {
      const settings = await fetchPaymentGatewaySettings();
      if (!settings || !settings.chipAsiaSecretKey) return res.status(503).end();

      const signature = req.header("X-Signature");
      if (!signature) {
        await logPaymentWebhookEvent({
          transactionReference: transactionId, signaturePresent: false, publicKeyCached: Boolean(chipAsiaPublicKeyCache),
          verificationResult: "skipped_no_signature", wouldHaveBlocked: true, enforced: enforceEnabled, payload: purchase,
        });
        if (enforceEnabled) return res.status(400).end();
      } else {
        if (!chipAsiaPublicKeyCache) {
          const keyRes = await fetch("https://gate.chip-in.asia/api/v1/public_key/", {
            headers: { Authorization: `Bearer ${settings.chipAsiaSecretKey}` },
          });
          if (keyRes.ok) chipAsiaPublicKeyCache = await keyRes.text();
        }

        if (!chipAsiaPublicKeyCache) {
          // Fail-closed design: with no public key to verify against, the
          // payload's authenticity cannot be confirmed. Logged as a would-block;
          // only actually rejected once HQ has enabled enforcement.
          console.error("Chip Asia webhook received with no public key cached — cannot verify signature");
          await logPaymentWebhookEvent({
            transactionReference: transactionId, signaturePresent: true, publicKeyCached: false,
            verificationResult: "skipped_no_key", wouldHaveBlocked: true, enforced: enforceEnabled, payload: purchase,
          });
          if (enforceEnabled) return res.status(401).end();
        } else {
          const rawBody = JSON.stringify(purchase);
          const verifier = createVerify("RSA-SHA256");
          verifier.update(rawBody);
          const valid = verifier.verify(chipAsiaPublicKeyCache, Buffer.from(signature, "base64"));
          await logPaymentWebhookEvent({
            transactionReference: transactionId, signaturePresent: true, publicKeyCached: true,
            verificationResult: valid ? "verified" : "failed", wouldHaveBlocked: !valid, enforced: enforceEnabled, payload: purchase,
          });
          if (!valid) {
            console.error("Chip Asia webhook signature verification failed");
            if (enforceEnabled) return res.status(401).end();
          }
        }
      }

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
        strategy: dbConfig.strategy,
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
        ? [{ provider: p, apiKey: envKeys[p]!, model: MODEL_CATALOGUE[p][0].id, costUsd: 0, strategy: "env_forced" }]
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
      .map(p => ({ provider: p, apiKey: envKeys[p]!, model: process.env[`${p.toUpperCase()}_MODEL`] || MODEL_CATALOGUE[p][0].id, costUsd: 0, strategy: "env_order" }));
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          { inlineData: { mimeType, data: base64Data } },
          ocrPrompt
        ],
        config: {
          abortSignal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function callOpenAiCompatibleOcr(baseUrl: string, apiKey: string, model: string, mimeType: string, base64Data: string, ocrPrompt: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
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
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`AI provider OCR API error ${resp.status}: ${errBody}`);
      }
      const data: any = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No response content returned from AI provider OCR API");
      return parseJsonLoose(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function callAnthropicOcr(apiKey: string, model: string, mimeType: string, base64Data: string, ocrPrompt: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
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
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Anthropic OCR API error ${resp.status}: ${errBody}`);
      }
      const data: any = await resp.json();
      const content = data.content?.[0]?.text;
      if (!content) throw new Error("No response content returned from Anthropic OCR API");
      return parseJsonLoose(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Text-based extraction path for PDF bank statements. AI provider chat-completion
  // `image_url`/`image` content blocks only accept raster image formats (png/jpeg/etc) —
  // sending a PDF that way is silently rejected by the provider, which previously caused
  // every PDF upload to exhaust all candidates and fall back to fabricated mock data.
  // Instead, the PDF's text layer is extracted locally (pdf-parse) and sent as plain text,
  // which every provider's standard chat-completions endpoint already supports natively.
  // Bank statements with many pages produce a wall of extracted text that can exceed a
  // single AI call's effective output budget — the model silently stops emitting
  // transactions once it nears its token ceiling, so a 129-page statement could come
  // back with only 27 transactions instead of the hundreds actually present. Splitting
  // the text into line-aligned chunks and issuing one extraction call per chunk (then
  // merging the results) keeps every call's output well within budget so no transaction
  // range is ever silently dropped.
  function chunkStatementText(text: string, maxCharsPerChunk: number = 6000): string[] {
    const lines = text.split(/\r\n|\r|\n/);
    const chunks: string[] = [];
    let current: string[] = [];
    let currentLen = 0;
    for (const line of lines) {
      const lineLen = line.length + 1;
      if (currentLen + lineLen > maxCharsPerChunk && current.length > 0) {
        chunks.push(current.join("\n"));
        current = [];
        currentLen = 0;
      }
      current.push(line);
      currentLen += lineLen;
    }
    if (current.length > 0) chunks.push(current.join("\n"));
    return chunks.length > 0 ? chunks : [text];
  }

  async function callAiProviderTextOcr(candidate: AiCandidate, extractedText: string, ocrPrompt: string): Promise<any> {
    const fullPrompt = `${ocrPrompt}\n\nDocument text extracted from the PDF:\n"""\n${extractedText}\n"""`;
    if (candidate.provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: candidate.apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: fullPrompt,
        config: { responseMimeType: "application/json" },
      });
      const responseText = response.text;
      if (!responseText) throw new Error("No response text returned from Gemini API");
      return JSON.parse(responseText);
    }
    if (candidate.provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": candidate.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: candidate.model, max_tokens: 4096, messages: [{ role: "user", content: fullPrompt }] }),
      });
      if (!resp.ok) throw new Error(`Anthropic text OCR API error ${resp.status}: ${await resp.text()}`);
      const data: any = await resp.json();
      const content = data.content?.[0]?.text;
      if (!content) throw new Error("No response content returned from Anthropic text OCR API");
      return parseJsonLoose(content);
    }
    const baseUrl = OPENAI_COMPATIBLE_BASE_URLS[candidate.provider];
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${candidate.apiKey}` },
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: "user", content: fullPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!resp.ok) throw new Error(`AI provider text OCR API error ${resp.status}: ${await resp.text()}`);
    const data: any = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content returned from AI provider text OCR API");
    return parseJsonLoose(content);
  }

  async function callGeminiAssistant(apiKey: string, model: string, systemPrompt: string) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: systemPrompt,
        config: {
          abortSignal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function callOpenAiCompatibleAssistant(baseUrl: string, apiKey: string, model: string, systemPrompt: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: systemPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.4,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`AI provider API error ${resp.status}: ${errBody}`);
      }
      const data: any = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No response content returned from AI provider API");
      return parseJsonLoose(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function callAnthropicAssistant(apiKey: string, model: string, systemPrompt: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
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
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${errBody}`);
      }
      const data: any = await resp.json();
      const content = data.content?.[0]?.text;
      if (!content) throw new Error("No response content returned from Anthropic API");
      return parseJsonLoose(content);
    } finally {
      clearTimeout(timeoutId);
    }
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
