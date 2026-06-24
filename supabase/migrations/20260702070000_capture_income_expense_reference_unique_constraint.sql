-- Repository capture of production-only migration "fix_income_expense_reference_unique_constraint"
-- (remote version 20260622134430). Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uq_income_records_workspace_reference
  ON public.income_records (workspace_id, reference_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_records_workspace_reference
  ON public.expense_records (workspace_id, reference_number);
