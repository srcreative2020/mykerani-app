import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface AiCreditsState {
  used: number;
  total: number;
  planName: string;
  isLoading: boolean;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads the wallet directly (single source of truth) instead of recomputing
// usage from the audit log — "used" is derived as allowance - balance.
function useResourceCredits(tenantId: string, workspaceId: string | undefined, balanceCol: string, allowanceCol: string): AiCreditsState {
  const [state, setState] = useState<AiCreditsState>({ used: 0, total: 500, planName: "Starter", isLoading: false });

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || !tenantId || !uuidRe.test(tenantId) || !workspaceId || !uuidRe.test(workspaceId)) {
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, isLoading: true }));

    Promise.all([
      supabase.from("resource_wallets").select(balanceCol).eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("tenant_subscriptions").select("plan_id").eq("tenant_id", tenantId).maybeSingle(),
    ]).then(async ([walletRes, subRes]) => {
      if (cancelled) return;
      const balance = Number((walletRes.data as any)?.[balanceCol]) || 0;
      let total = 500;
      let planName = "Starter";
      if (subRes.data?.plan_id) {
        const { data: plan } = await supabase.from("subscription_plans").select(`name, ${allowanceCol}`).eq("id", subRes.data.plan_id).maybeSingle();
        if (!cancelled && plan) {
          total = Number((plan as any)[allowanceCol]) || 500;
          planName = (plan as any).name;
        }
      }
      const used = Math.max(0, total - balance);
      if (!cancelled) setState({ used, total, planName, isLoading: false });
    });

    return () => { cancelled = true; };
  }, [tenantId, workspaceId]);

  return state;
}

export function useAiCredits(tenantId: string, workspaceId?: string): AiCreditsState {
  return useResourceCredits(tenantId, workspaceId, "ai_credits_balance", "ai_credits_allowance");
}

export function useOcrCredits(tenantId: string, workspaceId?: string): AiCreditsState {
  return useResourceCredits(tenantId, workspaceId, "ocr_credits_balance", "ocr_credits_allowance");
}
