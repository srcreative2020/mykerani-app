-- Bank-statement bulk-import lines carry a deterministic reference number of
-- the form 'STMT-<docId>-<idx>' and are upserted with
-- onConflict: "workspace_id,reference_number" (see isAiConfirmed in
-- FinancialRecordsContext.tsx), exactly like 'AI-' chat-confirmed records.
-- The 20260624000000 migration added a partial unique index for 'AI-%' but
-- missed 'STMT-%', so every bank-statement import line failed upsert with
-- Postgres 42P10 (no unique/exclusion constraint matching ON CONFLICT).

CREATE UNIQUE INDEX IF NOT EXISTS uq_income_records_stmt_reference
    ON public.income_records (workspace_id, reference_number)
    WHERE reference_number LIKE 'STMT-%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_records_stmt_reference
    ON public.expense_records (workspace_id, reference_number)
    WHERE reference_number LIKE 'STMT-%';
