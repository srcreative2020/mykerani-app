import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface AiCreditsState {
  used: number;
  total: number;
  planName: string;
  isLoading: boolean;
  packageQuota: number;
  purchasedTopup: number;
  remaining: number;
  planAllowance: number;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_STATE: AiCreditsState = {
  used: 0, total: 500, planName: "Starter", isLoading: false,
  packageQuota: 0, purchasedTopup: 0, remaining: 0, planAllowance: 0,
};

// Single source of truth for AI/OCR/Storage balances — reads the unified
// get_resource_wallet_breakdown() RPC (see
// supabase/migrations/20260801040000_unified_resource_wallet_engine.sql)
// instead of hand-deriving used = allowance - balance per resource type.
// total/used here are package_quota+purchased_topup and usage respectively,
// so the visible "X / Y kredit" bar still reflects topups, while `remaining`
// is exposed separately as the ground-truth enforced balance.
function useResourceCredits(tenantId: string, workspaceId: string | undefined, creditType: "AI" | "OCR"): AiCreditsState {
  const [state, setState] = useState<AiCreditsState>(EMPTY_STATE);

  const refresh = useCallback(() => {
    if (!isSupabaseConfigured() || !supabase || !tenantId || !uuidRe.test(tenantId) || !workspaceId || !uuidRe.test(workspaceId)) {
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, isLoading: true }));

    Promise.all([
      supabase.rpc("get_resource_wallet_breakdown", { p_workspace_id: workspaceId }),
      supabase.from("tenant_subscriptions").select("plan_id, subscription_plans(name)").eq("tenant_id", tenantId).maybeSingle(),
    ]).then(([rpcRes, subRes]) => {
      if (cancelled) return;
      const row = (rpcRes.data as any[] | null)?.find(r => r.credit_type === creditType);
      const planName = (subRes.data as any)?.subscription_plans?.name || "Starter";
      if (!row) {
        if (!cancelled) setState({ ...EMPTY_STATE, planName, isLoading: false });
        return;
      }
      const packageQuota = Number(row.package_quota) || 0;
      const purchasedTopup = Number(row.purchased_topup) || 0;
      const usage = Number(row.usage) || 0;
      const remaining = Number(row.remaining) || 0;
      const planAllowance = Number(row.plan_allowance) || 0;
      const total = packageQuota + purchasedTopup;
      setState({
        used: usage, total: total > 0 ? total : 500, planName, isLoading: false,
        packageQuota, purchasedTopup, remaining, planAllowance,
      });
    });

    return () => { cancelled = true; };
  }, [tenantId, workspaceId, creditType]);

  useEffect(() => {
    const cleanup = refresh();
    return () => { if (typeof cleanup === "function") cleanup(); };
  }, [refresh]);

  // Subscribe to realtime changes on resource_wallets so the wallet
  // breakdown refreshes immediately after a top-up (or any other write)
  // instead of waiting for the next workspace/tenant change to re-run the
  // effect above. Each hook instance gets its own uniquely-named channel
  // (includes creditType) to prevent "cannot add callbacks after subscribe"
  // when useAiCredits and useOcrCredits both run in the same component.
  useEffect(() => {
    if (!supabase || !tenantId || !workspaceId) return;
    const channelName = `resource_wallets_${workspaceId}_${creditType}`;
    const channel = supabase.channel(channelName);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'resource_wallets', filter: `workspace_id=eq.${workspaceId}` }, () => { refresh(); });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'resource_wallet_transactions' }, () => { refresh(); });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, workspaceId, creditType, refresh]);

  return state;
}

export function useAiCredits(tenantId: string, workspaceId?: string): AiCreditsState {
  return useResourceCredits(tenantId, workspaceId, "AI");
}

export function useOcrCredits(tenantId: string, workspaceId?: string): AiCreditsState {
  return useResourceCredits(tenantId, workspaceId, "OCR");
}
