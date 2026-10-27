import type { AlertRow, AlertSeverity, AlertType, MapNode, TelemetryRow } from "@/types/database.types";
import { ALERT_TYPE_LABELS } from "@/lib/constants";
import { clamp } from "@/lib/utils";
import { buildInitialTelemetry, HOTSPOT_NODE_ID, INITIAL_MOCK_ALERTS, INITIAL_MOCK_NODES } from "@/lib/demo/mockData";
import type { ActionResult } from "@/lib/action-result";

type Listener<T> = (value: T) => void;
type Unsubscribe = () => void;

const TICK_INTERVAL_MS = 4000;
const TELEMETRY_HISTORY_LIMIT = 200;
const ALERT_FEED_LIMIT = 100;

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * A tiny in-process pub/sub that stands in for a Supabase Realtime + Postgres
 * backend during local development. It reproduces the same alert-derivation
 * thresholds as `supabase/migrations/0001_init.sql` (`handle_new_telemetry`)
 * so the demo behaves like the real system, just without a database.
 *
 * This module is only ever imported from Client Components, so it lives
 * exclusively in the browser bundle — the interval-driven simulation never
 * runs during server rendering or inside a Server Action.
 */
class DemoStore {
  private nodes: MapNode[] = INITIAL_MOCK_NODES.map((node) => ({ ...node }));
  private telemetryByNode: Map<string, TelemetryRow[]> = buildInitialTelemetry(this.nodes);
  private alerts: AlertRow[] = [...INITIAL_MOCK_ALERTS];
  private nextTelemetryId =
    Math.max(0, ...[...this.telemetryByNode.values()].flat().map((row) => row.id)) + 1;
  private nextAlertId = 1;

  private nodeListeners = new Set<Listener<MapNode[]>>();
  private alertListeners = new Set<Listener<AlertRow[]>>();
  private telemetryListeners = new Map<string, Set<Listener<TelemetryRow[]>>>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  private ensureSimulationRunning() {
    if (this.intervalHandle || typeof window === "undefined") return;
    this.intervalHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------

  subscribeNodes(listener: Listener<MapNode[]>): Unsubscribe {
    this.ensureSimulationRunning();
    this.nodeListeners.add(listener);
    listener(this.nodes);
    return () => {
      this.nodeListeners.delete(listener);
    };
  }

  subscribeAlerts(listener: Listener<AlertRow[]>): Unsubscribe {
    this.ensureSimulationRunning();
    this.alertListeners.add(listener);
    listener(this.alerts);
    return () => {
      this.alertListeners.delete(listener);
    };
  }

  subscribeTelemetry(nodeId: string, listener: Listener<TelemetryRow[]>): Unsubscribe {
    this.ensureSimulationRunning();
    if (!this.telemetryListeners.has(nodeId)) {
      this.telemetryListeners.set(nodeId, new Set());
    }
    this.telemetryListeners.get(nodeId)!.add(listener);
    listener(this.telemetryByNode.get(nodeId) ?? []);
    return () => {
      this.telemetryListeners.get(nodeId)?.delete(listener);
    };
  }

  private notifyNodes() {
    for (const listener of this.nodeListeners) listener(this.nodes);
  }

  private notifyAlerts() {
    for (const listener of this.alertListeners) listener(this.alerts);
  }

  private notifyTelemetry(nodeId: string) {
    const rows = this.telemetryByNode.get(nodeId) ?? [];
    this.telemetryListeners.get(nodeId)?.forEach((listener) => listener(rows));
  }

  // ---------------------------------------------------------------------
  // Mutations (mirror src/app/actions.ts for when there's no server to hit)
  // ---------------------------------------------------------------------

  acknowledgeAlert(alertId: number, operatorName: string): ActionResult {
    const alert = this.alerts.find((row) => row.id === alertId);
    if (!alert) return { success: false, error: "Alert not found." };
    alert.acknowledged_at = new Date().toISOString();
    alert.acknowledged_by = operatorName || "Console Operator";
    this.alerts = [...this.alerts];
    this.notifyAlerts();
    return { success: true };
  }

  resolveAlert(alertId: number, resolutionNote: string): ActionResult {
    const alert = this.alerts.find((row) => row.id === alertId);
    if (!alert) return { success: false, error: "Alert not found." };
    alert.resolved_at = new Date().toISOString();
    alert.resolution_note = resolutionNote || null;
    this.alerts = [...this.alerts];
    this.notifyAlerts();
    return { success: true };
  }

  deleteAlert(alertId: number): ActionResult {
    this.alerts = this.alerts.filter((row) => row.id !== alertId);
    this.notifyAlerts();
    return { success: true };
  }

  clearAlerts(): ActionResult {
    this.alerts = [];
    this.nodes = this.nodes.map((n) => ({ ...n, status: "normal" as const }));
    this.notifyAlerts();
    this.notifyNodes();
    return { success: true };
  }

  updateNodeNotes(nodeId: string, notes: string): ActionResult {
    const node = this.nodes.find((row) => row.id === nodeId);
    if (!node) return { success: false, error: "Node not found." };
    node.notes = notes;
    this.nodes = [...this.nodes];
    this.notifyNodes();
    return { success: true };
  }

  // ---------------------------------------------------------------------
  // Simulation loop
  // ---------------------------------------------------------------------

  private deriveStatus(reading: Pick<TelemetryRow, "acoustic_confidence" | "tilt_deg" | "impact_g" | "battery_pct">) {
    if (reading.acoustic_confidence >= 0.85 || reading.tilt_deg >= 35 || reading.impact_g >= 2.5) {
      return "alert" as const;
    }
    if (
      reading.acoustic_confidence >= 0.55 ||
      reading.tilt_deg >= 15 ||
      reading.impact_g >= 1.2 ||
      reading.battery_pct <= 15
    ) {
      return "warning" as const;
    }
    return "normal" as const;
  }

  private maybeRaiseAlerts(node: MapNode, reading: TelemetryRow) {
    const raised: { alert_type: AlertType; severity: AlertSeverity; confidence: number; message: string }[] = [];

    if (reading.acoustic_confidence >= 0.55) {
      raised.push({
        alert_type: "chainsaw",
        severity: reading.acoustic_confidence >= 0.85 ? "critical" : "warning",
        confidence: reading.acoustic_confidence,
        message: `Chainsaw acoustic signature detected at ${Math.round(reading.acoustic_confidence * 100)}% confidence`,
      });
    }

    if (reading.tilt_deg >= 15 || reading.impact_g >= 1.2) {
      raised.push({
        alert_type: "tree_fall",
        severity: reading.tilt_deg >= 35 || reading.impact_g >= 2.5 ? "critical" : "warning",
        confidence: Math.min(1, Math.max(reading.tilt_deg / 45, reading.impact_g / 4)),
        message: `Tree movement detected: tilt ${reading.tilt_deg.toFixed(1)}°, impact ${reading.impact_g.toFixed(2)}g`,
      });
    }

    if (reading.battery_pct <= 15) {
      raised.push({
        alert_type: "low_battery",
        severity: "warning",
        confidence: 1,
        message: `Battery at ${Math.round(reading.battery_pct)}% — field service required`,
      });
    }

    if (raised.length === 0) return;

    const newAlerts: AlertRow[] = raised.map((entry) => ({
      id: this.nextAlertId++,
      node_id: node.id,
      telemetry_id: reading.id,
      alert_type: entry.alert_type,
      severity: entry.severity,
      confidence: entry.confidence,
      message: entry.message,
      location: "",
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null,
      resolution_note: null,
      created_at: reading.recorded_at,
    }));

    this.alerts = [...newAlerts, ...this.alerts].slice(0, ALERT_FEED_LIMIT);
    this.notifyAlerts();

    // Surface derived alerts in the console too, mirroring what an operator
    // would see land in their logs — purely a demo-mode nicety.
    for (const alert of newAlerts) {
      console.info(`[demo] ${ALERT_TYPE_LABELS[alert.alert_type]}: ${alert.message}`);
    }
  }

  private tick() {
    const node = this.nodes[Math.floor(Math.random() * this.nodes.length)];
    if (!node || node.status === "offline") return;

    const isHotspotEvent = node.id === HOTSPOT_NODE_ID && Math.random() < 0.18;
    const isRandomEvent = !isHotspotEvent && Math.random() < 0.03;
    const isEventful = isHotspotEvent || isRandomEvent;

    const batteryDrain = randomInRange(0.02, 0.08);
    const nextBattery = clamp(node.battery_pct - batteryDrain, 4, 100);

    const reading: TelemetryRow = {
      id: this.nextTelemetryId++,
      node_id: node.id,
      recorded_at: new Date().toISOString(),
      location: "",
      battery_pct: nextBattery,
      rssi_dbm: Math.round(clamp((node.rssi_dbm ?? -85) + randomInRange(-4, 4), -118, -60)),
      snr_db: Number(Math.max(-5, (node.snr_db ?? 5) + randomInRange(-1, 1)).toFixed(1)),
      temperature_c: Number((24 + randomInRange(0, 6)).toFixed(1)),
      humidity_pct: Number((65 + randomInRange(0, 20)).toFixed(1)),
      tilt_deg: Number((isEventful ? randomInRange(12, 42) : randomInRange(0, 3)).toFixed(1)),
      tilt_delta_deg: Number(randomInRange(-0.5, 0.5).toFixed(2)),
      impact_g: Number((isEventful ? randomInRange(1.0, 3.2) : randomInRange(0, 0.4)).toFixed(2)),
      acoustic_confidence: Number((isEventful ? randomInRange(0.6, 0.97) : randomInRange(0, 0.12)).toFixed(3)),
      acoustic_db: Number((38 + randomInRange(0, 40)).toFixed(1)),
      raw_payload: null,
      created_at: new Date().toISOString(),
    };

    const history = [...(this.telemetryByNode.get(node.id) ?? []), reading].slice(-TELEMETRY_HISTORY_LIMIT);
    this.telemetryByNode.set(node.id, history);
    this.notifyTelemetry(node.id);

    const status = this.deriveStatus(reading);
    this.nodes = this.nodes.map((n) =>
      n.id === node.id
        ? {
            ...n,
            battery_pct: reading.battery_pct,
            rssi_dbm: reading.rssi_dbm,
            snr_db: reading.snr_db,
            status,
            last_seen_at: reading.recorded_at,
          }
        : n
    );
    this.notifyNodes();

    const updatedNode = this.nodes.find((n) => n.id === node.id);
    if (updatedNode) this.maybeRaiseAlerts(updatedNode, reading);
  }
}

export const demoStore = new DemoStore();
