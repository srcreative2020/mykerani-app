-- Bank Statement Import Jobs
-- Tracks long-running bank statement processing with pause/resume/checkpoint support.
-- Completely isolated from OCR receipt/invoice workflow.

CREATE TABLE IF NOT EXISTS bank_statement_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL,
  file_name             VARCHAR(500) NOT NULL,
  file_data_text        TEXT,           -- extracted PDF text stored for resume without re-upload
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PROCESSING','PAUSED','INTERRUPTED','COMPLETED','FAILED','CANCELLED')),
  total_chunks          INT NOT NULL DEFAULT 0,
  chunks_completed      INT NOT NULL DEFAULT 0,
  chunks_failed         INT NOT NULL DEFAULT 0,
  transactions_found    INT NOT NULL DEFAULT 0,
  transactions_confirmed INT NOT NULL DEFAULT 0,
  ai_provider_used      VARCHAR(100),
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ
);

-- Non-Negotiable Rule #4: One active import per workspace at DB level.
-- PAUSED and INTERRUPTED count as active — user must explicitly cancel to start another.
CREATE UNIQUE INDEX bank_statement_jobs_one_active_per_workspace
  ON bank_statement_jobs (workspace_id)
  WHERE status IN ('PENDING', 'PROCESSING', 'PAUSED', 'INTERRUPTED');

CREATE INDEX bank_statement_jobs_workspace_idx ON bank_statement_jobs (workspace_id);
CREATE INDEX bank_statement_jobs_status_idx    ON bank_statement_jobs (status);
CREATE INDEX bank_statement_jobs_expires_idx   ON bank_statement_jobs (expires_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_bank_statement_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bank_statement_jobs_updated_at
  BEFORE UPDATE ON bank_statement_jobs
  FOR EACH ROW EXECUTE FUNCTION update_bank_statement_jobs_updated_at();

-- RLS
ALTER TABLE bank_statement_jobs ENABLE ROW LEVEL SECURITY;

-- Workspace members may insert their own jobs
CREATE POLICY "bank_statement_jobs_insert" ON bank_statement_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM user_role_assignments WHERE user_id = auth.uid()::text
    )
  );

-- Workspace members may read their own workspace's jobs
CREATE POLICY "bank_statement_jobs_select" ON bank_statement_jobs
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_role_assignments WHERE user_id = auth.uid()::text
    )
  );

-- Workspace members may update their own workspace's jobs (pause/resume/cancel)
CREATE POLICY "bank_statement_jobs_update" ON bank_statement_jobs
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_role_assignments WHERE user_id = auth.uid()::text
    )
  );

-- No DELETE policy — jobs are immutable audit records; cancel via status update.
