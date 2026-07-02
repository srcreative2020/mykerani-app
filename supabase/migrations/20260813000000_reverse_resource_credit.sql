-- Wave 4 W4.2 — reverse_resource_credit(p_txn_id)
-- Minimum RPC required for OCR credit rollback on provider failure.
-- Inserts a compensating REFUND row and restores the wallet balance.
-- No new tables, columns, or types — uses existing resource_wallet_transactions
-- (activity_type REFUND already in credit_activity_type enum) and resource_wallets.
-- Idempotent: if the transaction is not found or already reversed, exits silently.

CREATE OR REPLACE FUNCTION public.reverse_resource_credit(p_txn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_credit_type credit_type;
  v_amount      bigint;       -- stored as negative (e.g. -3 for a 3-page deduction)
BEGIN
  -- Find the original USAGE debit transaction
  SELECT wallet_id, credit_type, amount
  INTO v_wallet_id, v_credit_type, v_amount
  FROM public.resource_wallet_transactions
  WHERE id = p_txn_id AND activity_type = 'USAGE' AND amount < 0;

  IF NOT FOUND THEN RETURN; END IF;

  -- Guard: skip if a REFUND referencing this txn_id already exists (idempotency)
  IF EXISTS (
    SELECT 1 FROM public.resource_wallet_transactions
    WHERE activity_type = 'REFUND'
      AND wallet_id = v_wallet_id
      AND (metadata->>'reversed_txn_id')::uuid = p_txn_id
  ) THEN RETURN; END IF;

  -- Insert compensating REFUND row (positive amount = credits returned)
  INSERT INTO public.resource_wallet_transactions (wallet_id, credit_type, activity_type, amount, description, metadata)
  VALUES (
    v_wallet_id,
    v_credit_type,
    'REFUND',
    -v_amount,   -- v_amount is negative, so -v_amount is positive
    'Rollback automatik — pembekal OCR/AI gagal',
    jsonb_build_object('reversed_txn_id', p_txn_id, 'reason', 'provider_failure')
  );

  -- Restore wallet balance
  IF v_credit_type = 'AI' THEN
    UPDATE public.resource_wallets
      SET ai_credits_balance = ai_credits_balance + (-v_amount), updated_at = now()
      WHERE id = v_wallet_id;
  ELSIF v_credit_type = 'OCR' THEN
    UPDATE public.resource_wallets
      SET ocr_credits_balance = ocr_credits_balance + (-v_amount), updated_at = now()
      WHERE id = v_wallet_id;
  END IF;
END;
$$;

-- RLS: SECURITY DEFINER so server-side service-role calls work; no direct tenant access needed.
GRANT EXECUTE ON FUNCTION public.reverse_resource_credit(uuid) TO service_role;
