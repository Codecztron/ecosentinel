"use client";

import { useMemo, useState } from "react";
import type { AlertRow, MapNode } from "@/types/database.types";
import { AlertItem } from "@/components/alerts/AlertItem";
import { ClearAlertsButton } from "@/components/alerts/ClearAlertsButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

interface AlertFeedProps {
  alerts: AlertRow[];
  nodesById: Map<string, MapNode>;
  isLoading: boolean;
  onSelectNode?: (nodeId: string) => void;
}

type FilterMode = "active" | "all";

export function AlertFeed({ alerts, nodesById, isLoading, onSelectNode }: AlertFeedProps) {
  const [filter, setFilter] = useState<FilterMode>("active");
  const visibleAlerts = useMemo(
    () => (filter === "active" ? alerts.filter((alert) => !alert.acknowledged_at) : alerts),
    [alerts, filter]
  );
  const activeCount = alerts.filter((alert) => !alert.acknowledged_at).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-canopy-600 px-4 py-3 gap-2 flex-wrap">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wide text-canopy-100">
          Threat Feed
        </h2>

        <div className="flex items-center gap-2">
          {/* Tombol Hapus Semua Alert */}
          <ClearAlertsButton />

          {/* Filter Mode */}
          <div className="flex overflow-hidden rounded border border-canopy-600">
            <button
              onClick={() => setFilter("active")}
              className={cn(
                "px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition",
                filter === "active" ? "bg-canopy-100 text-canopy-950" : "text-canopy-300 hover:bg-canopy-700"
              )}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition",
                filter === "all" ? "bg-canopy-100 text-canopy-950" : "text-canopy-300 hover:bg-canopy-700"
              )}
            >
              All
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading ? (
          <LoadingSpinner label="Loading alerts…" className="justify-center py-8" />
        ) : visibleAlerts.length === 0 ? (
          <EmptyState
            title={filter === "active" ? "No active threats" : "No alerts recorded"}
            description={
              filter === "active"
                ? "All clear across the sensor network right now."
                : "Alerts will appear here as edge nodes detect activity."
            }
          />
        ) : (
          visibleAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              node={nodesById.get(alert.node_id)}
              onSelectNode={onSelectNode}
            />
          ))
        )}
      </div>
    </div>
  );
}
