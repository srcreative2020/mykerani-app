-- ============================================================================
-- MYKERANI Database Hardening Migration Script
-- Module: Fix Missing RLS Policies on evidence_documents
-- Created At: 2026-06-18
-- Description: evidence_documents (created in
--              20260601000000_core_architecture_foundation.sql) had RLS
--              enabled by default but was never given any policies, so every
--              insert/select/update/delete was denied outright ("new row
--              violates row-level security policy") — this is the table
--              src/lib/documentStorage.ts (uploadDocument/listDocuments/
--              deleteDocument) writes to for the tenant-owner "Dokumen" tab
--              (receipts, invoices, bank statements, supporting docs).
--              Mirrors the same tenant/workspace isolation pattern already
--              used for financial_evidence_packages.
-- ============================================================================

ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidence_documents_select_policy ON public.evidence_documents;
DROP POLICY IF EXISTS evidence_documents_insert_policy ON public.evidence_documents;
DROP POLICY IF EXISTS evidence_documents_update_policy ON public.evidence_documents;
DROP POLICY IF EXISTS evidence_documents_delete_policy ON public.evidence_documents;

CREATE POLICY evidence_documents_select_policy ON public.evidence_documents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_ADMIN'
    );

CREATE POLICY evidence_documents_insert_policy ON public.evidence_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_ADMIN'
    );

CREATE POLICY evidence_documents_update_policy ON public.evidence_documents
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_ADMIN'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_ADMIN'
    );

CREATE POLICY evidence_documents_delete_policy ON public.evidence_documents
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = workspace_id
              AND workspaces.tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() = 'HQ_ADMIN'
    );
