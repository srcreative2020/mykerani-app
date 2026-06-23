import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { ChatSuggestion } from "../lib/chatSuggestionTypes";

export interface CrossWorkspaceHint {
  workspaceId: string;
  workspaceName: string;
}

// Single shared Multi-Business Pattern Learning engine for AI Chat
// suggestions -- used identically by Tenant Owner (OwnerDashboard.tsx) and
// Tenant Staff (StaffHomeScreen.tsx) per the locked Owner-Staff Parity Rule
// (MYKERANI_OWNER_STAFF_PARITY_RULE.md). If this vendor/party has been
// confirmed repeatedly under a DIFFERENT company workspace, surface that as
// a hint -- the user still picks; AI never auto-switches the workspace.
export const useCrossWorkspacePattern = () => {
  const { isMockUser } = useAuth();
  const { activeTenant } = useTenant();
  const { activeWorkspace, workspaces } = useWorkspace();
  const [crossWorkspaceHints, setCrossWorkspaceHints] = useState<Record<string, CrossWorkspaceHint>>({});

  const checkCrossWorkspacePattern = async (s: ChatSuggestion) => {
    const vendorName = s.payload?.relatedParty;
    if (!vendorName || !activeTenant || !activeWorkspace || isMockUser || !isSupabaseConfigured() || !supabase) return;
    const otherWorkspaceIds = workspaces.filter(w => w.id !== activeWorkspace.id).map(w => w.id);
    if (otherWorkspaceIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from("ocr_learned_patterns")
        .select("workspace_id, vendor_name, confidence_score, occurrence_count")
        .in("workspace_id", otherWorkspaceIds)
        .ilike("vendor_name", vendorName)
        .gte("confidence_score", 0.7)
        .gte("occurrence_count", 2)
        .order("occurrence_count", { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return;

      const matchWorkspace = workspaces.find(w => w.id === data[0].workspace_id);
      if (!matchWorkspace) return;

      setCrossWorkspaceHints(prev => ({ ...prev, [s.id]: { workspaceId: matchWorkspace.id, workspaceName: matchWorkspace.name } }));
    } catch {
      // Best-effort hint only -- never block the underlying suggestion flow.
    }
  };

  return { crossWorkspaceHints, checkCrossWorkspacePattern };
};
