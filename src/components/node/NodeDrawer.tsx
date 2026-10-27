"use client";

import { useEffect, useState, useTransition } from "react";
import type { MapNode } from "@/types/database.types";
import { useNodeTelemetryHistory } from "@/hooks/useNodeTelemetryHistory";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BatteryIndicator } from "@/components/node/BatteryIndicator";
import { SignalIndicator } from "@/components/node/SignalIndicator";
import { TelemetryGauge } from "@/components/node/TelemetryGauge";
import { TelemetryHistoryCharts } from "@/components/charts/TelemetryHistoryCharts";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { updateNodeNotes } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/config";
import { demoStore } from "@/lib/demo/store";
import { formatCoord, formatTimestamp, timeAgo } from "@/lib/utils";

interface NodeDrawerProps {
  node: MapNode | null;
  onClose: () => void;
}

export function NodeDrawer({ node, onClose }: NodeDrawerProps) {
  const { history, latest, isLoading } = useNodeTelemetryHistory(node?.id ?? null);
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [savedNodeId, setSavedNodeId] = useState<string | null>(null);

  useEffect(() => {
    setNotes(node?.notes ?? "");
    setSavedNodeId(null);
  }, [node?.id, node?.notes]);

  if (!node) return null;

  function handleSaveNotes() {
    if (!node) return;
    startTransition(async () => {
      if (isSupabaseConfigured) {
        await updateNodeNotes(node.id, notes);
      } else {
        demoStore.updateNodeNotes(node.id, notes);
      }
      setSavedNodeId(node.id);
    });
  }

  // Fallback ekstraksi aman dari kolom database maupun raw_payload JSON
  const rawPayload = (latest?.raw_payload ?? {}) as Record<string, unknown>;
  const loraPayload = (rawPayload.lora ?? {}) as Record<string, unknown>;

  const acousticDb =
    latest?.acoustic_db ??
    (loraPayload.db as number) ??
    (rawPayload.acoustic_db as number) ??
    0;

  const acousticConf =
    latest?.acoustic_confidence ??
    (loraPayload.ps as number) ??
    (rawPayload.acoustic_confidence as number) ??
    0;

  const vibrationG =
    latest?.vibration ??
    latest?.impact_g ??
    (loraPayload.vib as number) ??
    (rawPayload.impact_g as number) ??
    0;

  const vibrationConf =
    latest?.vibration_confidence ??
    (loraPayload.pg as number) ??
    (rawPayload.vibration_confidence as number) ??
    0;

  const bioMv =
    latest?.bio_mv ??
    (loraPayload.mv as number) ??
    (rawPayload.bio_mv as number) ??
    0;

  const bioConf =
    latest?.bio_confidence ??
    (loraPayload.pb as number) ??
    (rawPayload.bio_confidence as number) ??
    0;

  const statusLevel =
    latest?.status_level ??
    (loraPayload.st as number) ??
    (rawPayload.status_level as number) ??
    0;

  const gatewayId =
    latest?.gateway_id ??
    (rawPayload.gateway_id as string) ??
    "N/A";

  const gatewayPacket =
    latest?.gateway_packet ??
    (rawPayload.gateway_packet as number) ??
    0;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer Panel */}
      <aside className="fixed right-0 top-0 z-[1110] flex h-full w-full max-w-md flex-col border-l border-canopy-600 bg-canopy-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-canopy-600 px-5 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-canopy-400">
              {node.device_eui}
            </p>
            <h2 className="text-lg font-semibold text-canopy-100">{node.name}</h2>
            <p className="text-xs text-canopy-300">{node.forest_zone}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-canopy-300 transition hover:bg-canopy-700 hover:text-canopy-100"
            aria-label="Close node details"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Node Status Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-canopy-700/50 pb-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={node.status} pulse={node.status === "alert"} />
              <span className="font-mono text-xs text-canopy-400">
                Last seen {timeAgo(node.last_seen_at)}
              </span>
            </div>
            {latest && (
              <span className="rounded bg-canopy-800 px-2 py-0.5 font-mono text-[11px] text-canopy-300 border border-canopy-700">
                ST Lvl: {statusLevel}
              </span>
            )}
          </div>

          {/* Quick Hardware Metrics Grid */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-canopy-400">Battery</p>
              <BatteryIndicator percent={node.battery_pct} />
            </div>
            <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-canopy-400">Link Quality</p>
              <SignalIndicator rssi={node.rssi_dbm} snr={node.snr_db} />
            </div>
            <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-canopy-400">Firmware</p>
              <p className="font-mono text-sm text-canopy-100">v{node.firmware_version}</p>
            </div>
            <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-canopy-400">Position</p>
              <p className="font-mono text-xs text-canopy-100">
                {formatCoord(node.latitude)}, {formatCoord(node.longitude)}
              </p>
            </div>
          </section>

          {/* Live Telemetry Readings */}
          <section>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-canopy-300">
              Live Sensor Readings
            </h3>
            {isLoading && !latest ? (
              <LoadingSpinner label="Loading latest telemetry…" />
            ) : latest ? (
              <div className="flex flex-col gap-3 rounded border border-canopy-600 bg-canopy-800/60 p-3.5">
                <TelemetryGauge
                  label="Acoustic Signal"
                  value={acousticDb}
                  unit="dB"
                  max={120}
                  color="#EE0000"
                />
                <div className="flex justify-between font-mono text-[10px] text-canopy-400 -mt-2 px-1">
                  <span>Confidence (ps):</span>
                  <span className="text-canopy-200">{(acousticConf * 100).toFixed(1)}%</span>
                </div>

                <div className="my-1 border-t border-canopy-700/40" />

                <TelemetryGauge
                  label="Vibration Impact"
                  value={vibrationG}
                  unit="g"
                  max={8}
                  color="#3291FF"
                />
                <div className="flex justify-between font-mono text-[10px] text-canopy-400 -mt-2 px-1">
                  <span>Confidence (pg):</span>
                  <span className="text-canopy-200">{(vibrationConf * 100).toFixed(1)}%</span>
                </div>

                <div className="my-1 border-t border-canopy-700/40" />

                <TelemetryGauge
                  label="Bio Potential"
                  value={bioMv}
                  unit="mV"
                  max={1000}
                  color="#F5A623"
                />
                <div className="flex justify-between font-mono text-[10px] text-canopy-400 -mt-2 px-1">
                  <span>Confidence (pb):</span>
                  <span className="text-canopy-200">{(bioConf * 100).toFixed(1)}%</span>
                </div>

                <div className="mt-2 pt-2 border-t border-canopy-700/60 font-mono text-[10px] text-canopy-400 flex justify-between">
                  <span>Captured:</span>
                  <span className="text-canopy-300">{formatTimestamp(latest.recorded_at)}</span>
                </div>
              </div>
            ) : (
              <p className="font-mono text-xs text-canopy-400">No telemetry recorded for this node yet.</p>
            )}
          </section>

          {/* Network & Gateway Details */}
          {latest && (
            <section>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-canopy-300">
                Gateway & Payload Metadata
              </h3>
              <div className="rounded border border-canopy-600 bg-canopy-800/60 overflow-hidden font-mono text-xs">
                <div className="flex justify-between p-2.5 border-b border-canopy-700/50">
                  <span className="text-canopy-400">Gateway ID</span>
                  <span className="text-canopy-100">{gatewayId}</span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-canopy-400">Packet Counter</span>
                  <span className="text-canopy-100">#{gatewayPacket}</span>
                </div>
              </div>
            </section>
          )}

          {/* Historical Telemetry Charts */}
          <section>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-canopy-300">
              6-Hour History
            </h3>
            <TelemetryHistoryCharts history={history} isLoading={isLoading} />
          </section>

          {/* Patrol Notes Section */}
          <section>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-canopy-300">
              Patrol Notes
            </h3>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add instructions or context for the field team…"
              rows={3}
              className="w-full resize-none rounded border border-canopy-600 bg-canopy-800/60 p-2.5 text-sm text-canopy-100 placeholder:text-canopy-400 focus:border-signal-gold focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleSaveNotes}
                disabled={isPending}
                className="rounded bg-canopy-100 px-3 py-1.5 font-mono text-xs font-medium text-canopy-950 transition hover:bg-white disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save note"}
              </button>
              {savedNodeId === node.id && !isPending && (
                <span className="font-mono text-xs text-signal-green">Saved</span>
              )}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
