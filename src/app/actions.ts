"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import type { ActionResult } from "@/lib/action-result";

const NOT_CONFIGURED_ERROR =
  "Supabase isn't configured in this environment. This action only runs against a real backend.";

/** Marks an alert as acknowledged by the current operator. */
export async function acknowledgeAlert(alertId: number, operatorName: string): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: operatorName || "Unknown Operator",
    })
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/** Marks an alert as resolved with an optional closing note. */
export async function resolveAlert(alertId: number, resolutionNote: string): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote || null,
    })
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/** Updates operator-facing notes attached to a node (e.g. patrol instructions). */
export async function updateNodeNotes(nodeId: string, notes: string): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("nodes")
    .update({ notes })
    .eq("id", nodeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}
