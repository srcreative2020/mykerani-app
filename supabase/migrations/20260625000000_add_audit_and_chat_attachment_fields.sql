-- Accounting audit trail (who recorded a transaction) and chat attachment support.

ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(255);
ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
ALTER TABLE public.expense_records ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(255);
ALTER TABLE public.expense_records ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);

ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(20);
