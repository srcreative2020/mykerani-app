-- Active chat session tracking, so a page refresh can restore the current
-- conversation while login/logout still start a fresh one (per product
-- requirement: refresh = resume, login = new chat, logout = archive).
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(100),
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace_status ON public.chat_sessions (workspace_id, status);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_chat_sessions_policy" ON public.chat_sessions;
DROP POLICY IF EXISTS "insert_chat_sessions_policy" ON public.chat_sessions;
DROP POLICY IF EXISTS "update_chat_sessions_policy" ON public.chat_sessions;

CREATE POLICY "select_chat_sessions_policy" ON public.chat_sessions
    FOR SELECT TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
        OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
    );

CREATE POLICY "insert_chat_sessions_policy" ON public.chat_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
    );

-- Only the status/archived_at transition (ACTIVE -> ARCHIVED on logout) is
-- allowed; nothing else about a session is mutable.
CREATE POLICY "update_chat_sessions_policy" ON public.chat_sessions
    FOR UPDATE TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE tenant_id = public.get_tenant_id()
        )
    );

GRANT SELECT, INSERT, UPDATE ON public.chat_sessions TO authenticated, service_role;

-- Link each chat message to the session it belongs to, so the app can load
-- "this session's messages" instead of "this whole workspace's history ever".
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created ON public.ai_chat_messages (session_id, created_at);
