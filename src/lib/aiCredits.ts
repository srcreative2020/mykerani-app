import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface AiCreditsState {
  used: number;
  total: number;
  planName: string;
  isLoading: boolean;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useAiCredits(tenantId: string): AiCreditsState {
  const [state, setState] = useState<AiCreditsState>({ used: 0, total: 500, planName: "Starter", isLoading: false });

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !tenantId || !uuidRe.test(tenantId)) {
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, isLoading: true }));

    Promise.all([
      supabase.rpc("get_ai_usage_this_month", { p_tenant_id: tenantId }),
      supabase.from("tenant_subscriptions").select("plan_id").eq("tenant_id", tenantId).maybeSingle(),
    ]).then(async ([usageRes, subRes]) => {
      if (cancelled) return;
      const used = Number(usageRes.data) || 0;
      let total = 500;
      let planName = "Starter";
      if (subRes.data?.plan_id) {
        const { data: plan } = await supabase.from("subscription_plans").select("name, ai_credits_allowance").eq("id", subRes.data.plan_id).maybeSingle();
        if (!cancelled && plan) {
          total = Number(plan.ai_credits_allowance) || 500;
          planName = plan.name;
        }
      }
      if (!cancelled) setState({ used, total, planName, isLoading: false });
    });

    return () => { cancelled = true; };
  }, [tenantId]);

  return state;
}
