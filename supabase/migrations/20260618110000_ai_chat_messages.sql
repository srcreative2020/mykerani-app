CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(100),
    sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'ai')),
    text TEXT NOT NULL,
    suggestions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_workspace_created ON public.ai_chat_messages (workspace_id, created_at);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_ai_chat_messages_policy" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "insert_ai_chat_messages_policy" ON public.ai_chat_messages;

-- Chat history is tenant-owned conversational data, not a system event
-- log (see event_logs) or a mutation audit trail (see audit_logs). Reuses
-- the same tenant-isolation + immutability RLS posture as both.
CREATE POLICY "select_ai_chat_messages_policy" ON public.ai_chat_messages
    FOR SELECT TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

CREATE POLICY "insert_ai_chat_messages_policy" ON public.ai_chat_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
    );

-- No UPDATE/DELETE policies — immutable chat archive, matching audit_logs/event_logs.

GRANT SELECT, INSERT ON public.ai_chat_messages TO authenticated, service_role;
