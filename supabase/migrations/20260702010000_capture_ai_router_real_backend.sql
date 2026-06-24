-- Repository capture of production-only migration "ai_router_real_backend"
-- (remote version 20260617232000). Idempotent.

ALTER TABLE public.ai_router_settings ADD COLUMN IF NOT EXISTS id text NOT NULL DEFAULT 'global';
ALTER TABLE public.ai_router_settings ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'cheapest';
ALTER TABLE public.ai_router_settings ADD COLUMN IF NOT EXISTS usd_myr numeric NOT NULL DEFAULT 4.45;
ALTER TABLE public.ai_router_settings ADD COLUMN IF NOT EXISTS plan_routes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ai_router_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ai_router_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hq_manage_ai_router_settings ON public.ai_router_settings;
CREATE POLICY hq_manage_ai_router_settings ON public.ai_router_settings
  FOR ALL USING (is_hq_user()) WITH CHECK (is_hq_user());
