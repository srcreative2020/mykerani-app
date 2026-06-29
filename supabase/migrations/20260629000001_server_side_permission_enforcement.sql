-- Migration: Server-side permission enforcement for financial tables
-- Fixes PB-3: Permission matrix was client-side only; RLS is tenant-scoped
-- but not role-action-scoped. A staff user bypassing the UI could delete
-- records or update commitments despite the matrix denying those actions.
--
-- Approach: BEFORE DELETE / BEFORE UPDATE triggers that check the caller's
-- role and reject the operation for TENANT_STAFF. This is additive — it
-- does not modify existing RLS policies, so the risk of breaking legitimate
-- operations is minimised.

-- Helper: get the current user's role from user_role_assignments
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_role_assignments
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── DELETE enforcement: staff cannot delete financial records ──

CREATE OR REPLACE FUNCTION enforce_no_staff_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF get_user_role() = 'TENANT_STAFF' THEN
    RAISE EXCEPTION 'Kakitangan tidak mempunyai kebenaran untuk memadam rekod kewangan.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_staff_delete_income ON income_records;
CREATE TRIGGER prevent_staff_delete_income
  BEFORE DELETE ON income_records
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_expense ON expense_records;
CREATE TRIGGER prevent_staff_delete_expense
  BEFORE DELETE ON expense_records
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_receivable ON receivables;
CREATE TRIGGER prevent_staff_delete_receivable
  BEFORE DELETE ON receivables
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_payable ON payables;
CREATE TRIGGER prevent_staff_delete_payable
  BEFORE DELETE ON payables
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_debt ON debts;
CREATE TRIGGER prevent_staff_delete_debt
  BEFORE DELETE ON debts
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_commitment ON financial_commitments;
CREATE TRIGGER prevent_staff_delete_commitment
  BEFORE DELETE ON financial_commitments
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

DROP TRIGGER IF EXISTS prevent_staff_delete_evidence ON financial_evidence_packages;
CREATE TRIGGER prevent_staff_delete_evidence
  BEFORE DELETE ON financial_evidence_packages
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_delete();

-- ── UPDATE enforcement: staff cannot update financial commitments ──

CREATE OR REPLACE FUNCTION enforce_no_staff_update_commitment()
RETURNS TRIGGER AS $$
BEGIN
  IF get_user_role() = 'TENANT_STAFF' THEN
    RAISE EXCEPTION 'Kakitangan tidak mempunyai kebenaran untuk mengubah komitmen kewangan.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_staff_update_commitment ON financial_commitments;
CREATE TRIGGER prevent_staff_update_commitment
  BEFORE UPDATE ON financial_commitments
  FOR EACH ROW EXECUTE FUNCTION enforce_no_staff_update_commitment();