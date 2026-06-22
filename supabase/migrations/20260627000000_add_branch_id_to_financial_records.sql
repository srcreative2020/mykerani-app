-- Extends the existing Business Mapping (business_id) on financial record
-- tables with an optional branch_id link, so a transaction can be attributed
-- to a specific branch of a registered business, not just the business
-- itself. Same nullable + ON DELETE SET NULL posture as business_id:
-- deleting a branch must never delete or orphan a financial record.
--
-- branch_name is intentionally NOT stored, same as business_id/businessName:
-- the UI resolves the display label by looking branch_id up against the
-- businessBranches list at render time, so there is exactly one source of
-- truth for the name and renames never go stale.

ALTER TABLE public.income_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.business_branches(id) ON DELETE SET NULL;

ALTER TABLE public.expense_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.business_branches(id) ON DELETE SET NULL;

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.business_branches(id) ON DELETE SET NULL;

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.business_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_income_records_branch_id ON public.income_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_branch_id ON public.expense_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_receivables_branch_id ON public.receivables(branch_id);
CREATE INDEX IF NOT EXISTS idx_payables_branch_id ON public.payables(branch_id);
