"use client";

import { useCallback, useState } from "react";
import { useRealtimeNodes } from "@/hooks/useRealtimeNodes";
import { useRealtimeAlerts } from "@/hooks/useRealtimeAlerts";
import { Header } from "@/components/layout/Header";
import { StatsBar } from "@/components/layout/StatsBar";
import { NodeMapClient } from "@/components/map/NodeMapClient";
import { MapLegend } from "@/components/map/MapLegend";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { NodeDrawer } from "@/components/node/NodeDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AuthGate } from "@/components/auth/AuthGate";
import type { MapNode } from "@/types/database.types";

export default function DashboardPage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { nodes, nodesById, isLoading: nodesLoading, error: nodesError } = useRealtimeNodes();
  const { alerts, isLoading: alertsLoading, error: alertsError } = useRealtimeAlerts();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleSelectNode = useCallback((node: MapNode) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleSelectNodeById = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) ?? null : null;
  const activeAlertCount = alerts.filter((alert) => !alert.acknowledged_at).length;
  const isRealtimeConnected = !nodesError && !alertsError;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canopy-900">
      <Header
        isRealtimeConnected={isRealtimeConnected}
        totalNodes={nodes.length}
        activeAlertCount={activeAlertCount}
      />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {nodesLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner label="Connecting to sensor network…" />
            </div>
          ) : nodesError ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                title="Unable to load nodes"
                description={nodesError}
              />
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                title="No edge nodes deployed yet"
                description="Once ESP32-S3 nodes are registered and start reporting over LoRa, they'll appear here on the map."
              />
            </div>
          ) : (
            <>
              <NodeMapClient nodes={nodes} onSelectNode={handleSelectNode} />
              <MapLegend />
            </>
          )}
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col border-l border-canopy-600 bg-canopy-900">
          <StatsBar nodes={nodes} />
          <div className="min-h-0 flex-1">
            <AlertFeed
              alerts={alerts}
              nodesById={nodesById}
              isLoading={alertsLoading}
              onSelectNode={handleSelectNodeById}
            />
          </div>
        </aside>
      </div>

      <NodeDrawer node={selectedNode} onClose={() => setSelectedNodeId(null)} />
    </div>
  );
}
