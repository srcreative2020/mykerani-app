-- Extend staff action notification triggers to receivables and payables
-- The trigger function notify_owner_on_staff_financial_action() already exists
-- from migration 20260801040000. We extend its record_type labeling and
-- attach it to receivables and payables.

CREATE OR REPLACE FUNCTION public.notify_owner_on_staff_financial_action()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_actor_role TEXT;
  v_action_label TEXT;
  v_record_type TEXT;
  v_amount TEXT;
  v_msg TEXT;
BEGIN
  v_actor_role := get_user_role();
  IF v_actor_role <> 'TENANT_STAFF' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_record_type := TG_TABLE_NAME;
  v_amount := '';
  IF v_record_type = 'income_records' THEN
    v_record_type := 'rekod pendapatan';
    v_amount := 'RM ' || COALESCE(NEW.amount_myr::TEXT, OLD.amount_myr::TEXT);
  ELSIF v_record_type = 'expense_records' THEN
    v_record_type := 'rekod perbelanjaan';
    v_amount := 'RM ' || COALESCE(NEW.amount_myr::TEXT, OLD.amount_myr::TEXT);
  ELSIF v_record_type = 'receivables' THEN
    v_record_type := 'resit belum terima (receivable)';
    v_amount := 'RM ' || COALESCE(NEW.total_amount_myr::TEXT, OLD.total_amount_myr::TEXT);
  ELSIF v_record_type = 'payables' THEN
    v_record_type := 'bil belum bayar (payable)';
    v_amount := 'RM ' || COALESCE(NEW.total_amount_myr::TEXT, OLD.total_amount_myr::TEXT);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action_label := 'ditambah';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_label := 'dikemaskini';
  ELSIF TG_OP = 'DELETE' THEN
    v_action_label := 'dipadam';
  END IF;

  SELECT w.tenant_id INTO v_tenant_id
  FROM workspaces w
  WHERE w.id = COALESCE(NEW.workspace_id, OLD.workspace_id);

  v_msg := 'Staff telah ' || v_action_label || ' ' || v_record_type;
  IF v_amount <> '' THEN
    v_msg := v_msg || ' (' || v_amount || ')';
  END IF;
  v_msg := v_msg || '. Sila semak rekod untuk kelulusan.';

  INSERT INTO workspace_notifications (
    workspace_id, tenant_id, category, title, message, status, metadata
  ) VALUES (
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    v_tenant_id,
    'FINANCIAL_RECORD',
    'Tindakan Staff: ' || v_record_type || ' ' || v_action_label,
    v_msg,
    'UNREAD',
    jsonb_build_object(
      'action', TG_OP, 'table', TG_TABLE_NAME,
      'record_id', COALESCE(NEW.id, OLD.id), 'actor_role', v_actor_role
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop old triggers and recreate with the updated function
DROP TRIGGER IF EXISTS trg_notify_owner_on_income_staff_action ON public.income_records;
DROP TRIGGER IF EXISTS trg_notify_owner_on_expense_staff_action ON public.expense_records;

CREATE TRIGGER trg_notify_owner_on_income_staff_action
  AFTER INSERT OR UPDATE OR DELETE ON public.income_records
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_staff_financial_action();

CREATE TRIGGER trg_notify_owner_on_expense_staff_action
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_records
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_staff_financial_action();

-- New triggers for receivables and payables
CREATE TRIGGER trg_notify_owner_on_receivables_staff_action
  AFTER INSERT OR UPDATE OR DELETE ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_staff_financial_action();

CREATE TRIGGER trg_notify_owner_on_payables_staff_action
  AFTER INSERT OR UPDATE OR DELETE ON public.payables
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_staff_financial_action();