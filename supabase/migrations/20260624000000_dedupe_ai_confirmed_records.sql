-- ============================================================================
-- Prevent duplicate inserts when the same AI chat suggestion is confirmed more
-- than once (e.g. from a second browser/session where localStorage confirm
-- status isn't shared). AI-confirmed records always carry a deterministic
-- reference number of the form 'AI-<suggestionId>', so a partial unique index
-- on (workspace_id, reference_number/invoice_number/bill_number) lets the
-- app upsert idempotently instead of relying solely on client-side state.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_income_records_ai_reference
    ON public.income_records (workspace_id, reference_number)
    WHERE reference_number LIKE 'AI-%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_records_ai_reference
    ON public.expense_records (workspace_id, reference_number)
    WHERE reference_number LIKE 'AI-%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_receivables_ai_invoice_number
    ON public.receivables (workspace_id, invoice_number)
    WHERE invoice_number LIKE 'AI-%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payables_ai_bill_number
    ON public.payables (workspace_id, bill_number)
    WHERE bill_number LIKE 'AI-%';
