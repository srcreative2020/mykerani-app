-- ============================================================================
-- Financial Profile Enhancement — Wave 3: Nullable FK Columns on Financial Tables
-- Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
--
-- Adds: customer_id on receivables + income_records
--       supplier_id on payables + expense_records
-- All columns are NULLABLE — existing rows are unaffected.
-- No data migration is forced; the AI suggests links going forward.
-- ============================================================================

-- receivables.customer_id → profile_customers
ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profile_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receivables_customer
  ON public.receivables(customer_id) WHERE customer_id IS NOT NULL;

-- payables.supplier_id → profile_suppliers
ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.profile_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payables_supplier
  ON public.payables(supplier_id) WHERE supplier_id IS NOT NULL;

-- income_records.customer_id → profile_customers
ALTER TABLE public.income_records
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profile_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_income_customer
  ON public.income_records(customer_id) WHERE customer_id IS NOT NULL;

-- expense_records.supplier_id → profile_suppliers
ALTER TABLE public.expense_records
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.profile_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_supplier
  ON public.expense_records(supplier_id) WHERE supplier_id IS NOT NULL;