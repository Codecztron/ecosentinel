"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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

/** Deletes a single alert by its ID using Service Role client to bypass RLS. */
export async function deleteAlert(alertId: number): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("alerts")
    .delete()
    .eq("id", alertId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/** Clears all stored alerts from the database and resets node statuses back to normal using Service Role client. */
export async function clearAllAlerts(): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = createServiceRoleClient();

  // 1. Hapus seluruh baris data dari tabel alerts
  const { error: clearAlertsError } = await supabase
    .from("alerts")
    .delete()
    .neq("id", 0);

  if (clearAlertsError) {
    return { success: false, error: clearAlertsError.message };
  }

  // 2. Kembalikan seluruh status node ke 'normal'
  const { error: resetNodesError } = await supabase
    .from("nodes")
    .update({ status: "normal" })
    .neq("id", "");

  if (resetNodesError) {
    console.error("Failed to reset node statuses:", resetNodesError.message);
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
