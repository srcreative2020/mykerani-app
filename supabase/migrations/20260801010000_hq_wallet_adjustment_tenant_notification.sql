-- ============================================================================
-- Fix C-01: hq_manual_wallet_adjustment must notify the affected tenant
--           workspace whenever HQ manually adjusts a resource wallet.
--
-- The wave1 migration (20260725000000) added an audit_logs entry and a
-- workspace_notifications INSERT using p_workspace_id/p_tenant_id directly.
-- This migration replaces that with a SELECT-based insert that reads the
-- wallet row by workspace_id — matching the closed-loop notification pattern
-- used in all other wallet-touching RPCs — and uses Malaysian-language
-- messaging consistent with the rest of the notification corpus.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hq_manual_wallet_adjustment(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_credit_type credit_type,
  p_delta bigint,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_email text;
  v_result boolean;
  v_wallet record;
begin
  if not is_hq_owner() then
    raise exception 'Permission denied: HQ_OWNER access required';
  end if;

  select email into v_actor_email from public.user_role_assignments where user_id = auth.uid()::text limit 1;

  v_result := public.adjust_wallet_balance(p_tenant_id, p_workspace_id, p_credit_type, p_delta, p_reason, 'hq_manual_adjustment');

  insert into public.audit_logs (user_id, user_email, user_role, tenant_id, module, action, old_value, new_value)
  values (auth.uid()::text, coalesce(v_actor_email, 'hq'), 'HQ_OWNER', p_tenant_id, 'Resource Wallet', 'ADJUSTMENT',
    null, jsonb_build_object('credit_type', p_credit_type, 'delta', p_delta, 'reason', p_reason));

  -- Resolve the wallet row so we can fan-out via the standard
  -- workspace_id/tenant_id columns rather than trusting the caller's
  -- p_workspace_id/p_tenant_id arguments directly.
  select * into v_wallet from public.resource_wallets rw where rw.workspace_id = p_workspace_id;

  -- Notify tenant of wallet adjustment
  INSERT INTO workspace_notifications (
    workspace_id,
    tenant_id,
    category,
    title,
    message,
    status,
    metadata
  )
  SELECT
    rw.workspace_id,
    rw.tenant_id,
    'BILLING',
    CASE WHEN p_delta > 0 THEN 'Kredit Ditambah oleh HQ' ELSE 'Kredit Diselaraskan oleh HQ' END,
    CASE
      WHEN p_credit_type = 'AI' THEN
        CASE WHEN p_delta > 0
          THEN 'HQ telah menambah ' || p_delta || ' kredit AI ke workspace anda. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
          ELSE 'HQ telah menyesuaikan kredit AI workspace anda sebanyak ' || p_delta || '. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
        END
      WHEN p_credit_type = 'OCR' THEN
        CASE WHEN p_delta > 0
          THEN 'HQ telah menambah ' || p_delta || ' kredit OCR ke workspace anda. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
          ELSE 'HQ telah menyesuaikan kredit OCR workspace anda sebanyak ' || p_delta || '. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
        END
      ELSE
        CASE WHEN p_delta > 0
          THEN 'HQ telah menambah kredit ke workspace anda. Jenis: ' || p_credit_type || ', Jumlah: ' || p_delta || '. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
          ELSE 'HQ telah menyesuaikan kredit workspace anda. Jenis: ' || p_credit_type || ', Jumlah: ' || p_delta || '. Sebab: ' || COALESCE(p_reason, 'Pelarasan manual.')
        END
    END,
    'UNREAD',
    jsonb_build_object(
      'credit_type', p_credit_type,
      'amount', p_delta,
      'reason', p_reason,
      'adjusted_by', auth.uid()
    )
  FROM resource_wallets rw
  WHERE rw.id = v_wallet.id;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hq_manual_wallet_adjustment(uuid, uuid, credit_type, bigint, text) TO authenticated;
