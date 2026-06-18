-- ============================================================================
-- MYKERANI Database Migration
-- Module: Asset Purchase & Owner Transaction (capital/drawings) — closes the
--         last 2 of the 14 minimum transaction categories from the product
--         vision (Income, Expense, Receivable, Payable, Debt/Loan, Recurring
--         Commitment already existed; Asset Purchase and Owner Transaction
--         did not).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.asset_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    purchase_amount_myr NUMERIC(19, 4) NOT NULL CHECK (purchase_amount_myr >= 0),
    purchase_date DATE NOT NULL,
    vendor_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'owner_transaction_type') THEN
        CREATE TYPE owner_transaction_type AS ENUM ('CAPITAL_INJECTION', 'DRAWING');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.owner_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    type owner_transaction_type NOT NULL,
    amount_myr NUMERIC(19, 4) NOT NULL CHECK (amount_myr > 0),
    transaction_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_purchases_workspace ON public.asset_purchases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_owner_transactions_workspace ON public.owner_transactions(workspace_id);

ALTER TABLE public.asset_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['asset_purchases', 'owner_transactions']
    LOOP
        EXECUTE format($f$
            DROP POLICY IF EXISTS %1$I_select_policy ON public.%1$I;
            CREATE POLICY %1$I_select_policy ON public.%1$I
                FOR SELECT TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                    OR public.get_user_role() IN ('HQ_OWNER', 'HQ_STAFF', 'HQ_ADMIN', 'HQ_SUPPORT', 'HQ_AUDITOR')
                );

            DROP POLICY IF EXISTS %1$I_insert_policy ON public.%1$I;
            CREATE POLICY %1$I_insert_policy ON public.%1$I
                FOR INSERT TO authenticated
                WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                );

            DROP POLICY IF EXISTS %1$I_delete_policy ON public.%1$I;
            CREATE POLICY %1$I_delete_policy ON public.%1$I
                FOR DELETE TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.workspaces
                        WHERE workspaces.id = %1$I.workspace_id
                          AND workspaces.tenant_id = public.get_tenant_id()
                    )
                );
        $f$, t);
    END LOOP;
END $$;

GRANT SELECT, INSERT, DELETE ON public.asset_purchases, public.owner_transactions TO authenticated, service_role;
