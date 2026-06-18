CREATE TABLE IF NOT EXISTS public.event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    tenant_id UUID NOT NULL,
    workspace_id UUID,
    event_type VARCHAR(50) NOT NULL,  -- LOGIN, LOGOUT, UPLOAD, OCR_PROCESS, AI_ANALYSIS, REPORT_GENERATION, EXPORT, BACKUP, RESTORE
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_logs_tenant_created ON public.event_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON public.event_logs (event_type);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_event_logs_policy" ON public.event_logs;
DROP POLICY IF EXISTS "insert_event_logs_policy" ON public.event_logs;

-- Event logs are separate from audit_logs: audit_logs records data
-- mutations (CREATE/UPDATE/DELETE on financial records); event_logs records
-- system/operational events (login, logout, upload, OCR, AI calls, report
-- generation, export, backup, restore) for monitoring/analytics/cost
-- tracking/troubleshooting. Same tenant-isolation + immutability posture.
CREATE POLICY "select_event_logs_policy" ON public.event_logs
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

CREATE POLICY "insert_event_logs_policy" ON public.event_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_tenant_id()
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT')
    );

-- No UPDATE/DELETE policies — immutable, matching audit_logs.

GRANT SELECT, INSERT ON public.event_logs TO authenticated, service_role;
