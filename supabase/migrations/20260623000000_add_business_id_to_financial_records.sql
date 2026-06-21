-- Adds an optional business_id link to financial record tables so a transaction
-- recorded via the AI chat confirmation flow (or manual entry, in future) can be
-- attributed to a specific business in a multi-business workspace, or left null
-- for "Personal". Nullable + ON DELETE SET NULL: deleting a business must never
-- delete or orphan a financial record (financial records are tenant-owned and
-- must always remain intact per the Data Ownership Rule).

ALTER TABLE public.income_records
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.expense_records
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.financial_commitments
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_income_records_business_id ON public.income_records(business_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_business_id ON public.expense_records(business_id);
CREATE INDEX IF NOT EXISTS idx_receivables_business_id ON public.receivables(business_id);
CREATE INDEX IF NOT EXISTS idx_payables_business_id ON public.payables(business_id);
CREATE INDEX IF NOT EXISTS idx_debts_business_id ON public.debts(business_id);
CREATE INDEX IF NOT EXISTS idx_financial_commitments_business_id ON public.financial_commitments(business_id);
