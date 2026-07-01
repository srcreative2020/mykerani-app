-- Resource Billing Hotfix 2: Fix PostgreSQL overload ambiguity + ledger column ambiguity
-- Applied in 4 sub-steps; this file reflects the final working state.

-- ============================================================
-- FIX 1: Drop the broken overload of consume_resource_credit_v2
-- ============================================================
-- Root cause: original migration created (text, numeric) overload.
-- Hotfix 1 created a NEW (credit_type, bigint) overload instead of replacing
-- the old one — different parameter types = new overload in PostgreSQL.
-- Server sends p_credit_type as JSON string → PostgreSQL resolves to (text, numeric)
-- overload (old broken version with wrong WHERE clause) → ok=false → HTTP 402.
-- Fix: drop old overload. Only the correct (credit_type enum, bigint) version remains.
-- PostgreSQL then casts JSON string "AI"/"OCR" → credit_type enum automatically.
DROP FUNCTION IF EXISTS public.consume_resource_credit_v2(uuid, uuid, text, numeric, text);

-- ============================================================
-- FIX 2: Rewrite get_tenant_resource_ledger — fix column ambiguity
-- ============================================================
-- Root cause: RETURNS TABLE declared `amount numeric` and `running_balance numeric`.
-- PL/pgSQL treats RETURNS TABLE columns as implicit variables. Inside the function
-- body, `amount`, `credit_type`, `activity_type`, `description`, `created_at` etc.
-- were ambiguous between output variables and CTE column names → ERROR on every call.
-- Fix: rename all intermediate CTE columns with col_ prefix (no clash with output
-- variable names). Final SELECT aliases them back to the expected names.
-- Column types corrected to match resource_wallet_transactions schema:
--   amount → bigint, description → varchar→cast to text, running_balance → numeric
--   (SUM of bigint returns numeric in PostgreSQL).
DROP FUNCTION IF EXISTS public.get_tenant_resource_ledger(uuid, text, integer, integer);

CREATE FUNCTION public.get_tenant_resource_ledger(
  p_workspace_id uuid,
  p_credit_type  text    DEFAULT NULL,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE(
  txn_id          uuid,
  credit_type     text,
  activity_type   text,
  amount          bigint,
  description     text,
  metadata        jsonb,
  created_at      timestamptz,
  running_balance numeric,
  job_ref         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH wallet AS (
    SELECT id AS w_id FROM resource_wallets WHERE workspace_id = p_workspace_id LIMIT 1
  ),
  txns AS (
    SELECT
      t.id                                                             AS col_id,
      t.credit_type::text                                              AS col_credit_type,
      t.activity_type::text                                            AS col_activity_type,
      t.amount                                                         AS col_amount,
      t.description::text                                              AS col_description,
      t.metadata                                                       AS col_metadata,
      t.created_at                                                     AS col_created_at,
      COALESCE(t.metadata->>'job_ref', t.metadata->>'job_id')::text    AS col_job_ref
    FROM resource_wallet_transactions t
    JOIN wallet w ON t.wallet_id = w.w_id
    WHERE (p_credit_type IS NULL OR t.credit_type::text = p_credit_type)
  ),
  ranked AS (
    SELECT *,
      SUM(col_amount) OVER (
        PARTITION BY col_credit_type
        ORDER BY col_created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS col_running_balance
    FROM txns
  )
  SELECT
    r.col_id              AS txn_id,
    r.col_credit_type     AS credit_type,
    r.col_activity_type   AS activity_type,
    r.col_amount          AS amount,
    r.col_description     AS description,
    r.col_metadata        AS metadata,
    r.col_created_at      AS created_at,
    r.col_running_balance AS running_balance,
    r.col_job_ref         AS job_ref
  FROM ranked r
  ORDER BY r.col_created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
