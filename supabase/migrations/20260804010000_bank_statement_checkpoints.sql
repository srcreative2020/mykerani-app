-- Bank Statement Chunk Checkpoints
-- Stores per-chunk OCR results for pause/resume recovery.
-- Child of bank_statement_jobs; cascades on job deletion.

CREATE TABLE IF NOT EXISTS bank_statement_checkpoints (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_job_id  UUID NOT NULL REFERENCES bank_statement_jobs(id) ON DELETE CASCADE,
  chunk_index       INT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  chunk_text        TEXT,
  transactions_json JSONB,           -- raw AI-extracted transactions for this chunk
  attempt_count     INT NOT NULL DEFAULT 0,
  ai_provider_used  VARCHAR(100),
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (statement_job_id, chunk_index)
);

CREATE INDEX bank_statement_checkpoints_job_idx    ON bank_statement_checkpoints (statement_job_id);
CREATE INDEX bank_statement_checkpoints_status_idx ON bank_statement_checkpoints (statement_job_id, status);

-- RLS — inherit workspace isolation via JOIN to parent job
ALTER TABLE bank_statement_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_statement_checkpoints_insert" ON bank_statement_checkpoints
  FOR INSERT TO authenticated
  WITH CHECK (
    statement_job_id IN (
      SELECT bsj.id FROM bank_statement_jobs bsj
      JOIN user_role_assignments ura ON ura.tenant_id = bsj.tenant_id
      WHERE ura.user_id = auth.uid()::text
    )
  );

CREATE POLICY "bank_statement_checkpoints_select" ON bank_statement_checkpoints
  FOR SELECT TO authenticated
  USING (
    statement_job_id IN (
      SELECT bsj.id FROM bank_statement_jobs bsj
      JOIN user_role_assignments ura ON ura.tenant_id = bsj.tenant_id
      WHERE ura.user_id = auth.uid()::text
    )
  );

CREATE POLICY "bank_statement_checkpoints_update" ON bank_statement_checkpoints
  FOR UPDATE TO authenticated
  USING (
    statement_job_id IN (
      SELECT bsj.id FROM bank_statement_jobs bsj
      JOIN user_role_assignments ura ON ura.tenant_id = bsj.tenant_id
      WHERE ura.user_id = auth.uid()::text
    )
  );

-- No DELETE policy — checkpoints are immutable progress markers.
