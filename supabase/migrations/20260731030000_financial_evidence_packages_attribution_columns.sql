-- GAP-M2: financial_evidence_packages had no record of who uploaded a
-- document or its file size, making it impossible to attribute uploads to
-- a specific Staff/Owner or track storage usage per document.
ALTER TABLE public.financial_evidence_packages
  ADD COLUMN IF NOT EXISTS uploaded_by varchar,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;
