"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { MapNode } from "@/types/database.types";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import { BatteryIndicator } from "@/components/node/BatteryIndicator";
import { SignalIndicator } from "@/components/node/SignalIndicator";

interface NodeMapProps {
  nodes: MapNode[];
  onSelectNode: (node: MapNode) => void;
}

function buildIcon(node: MapNode): L.DivIcon {
  const color = STATUS_COLORS[node.status];
  const pulse = node.status === "alert";

  return L.divIcon({
    className: "",
    html: `
      <div style="position: relative; width: 22px; height: 22px; display:flex; align-items:center; justify-content:center;">
        ${
          pulse
            ? `<span style="position:absolute; inset:0; border-radius:9999px; background:${color}; opacity:0.55; animation: pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite;"></span>`
            : ""
        }
        <span style="position:relative; width:14px; height:14px; border-radius:9999px; background:${color}; border:2px solid #0A0A0A; box-shadow: 0 0 0 1px ${color}88;"></span>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

/** Fits the initial viewport to the deployed nodes without fighting user pan/zoom. */
function InitialNodeViewport({ nodes }: Pick<NodeMapProps, "nodes">) {
  const map = useMap();
  const fittedNodeIds = useRef<string | null>(null);

  useEffect(() => {
    if (nodes.length === 0) return;

    const nodeIds = nodes.map((node) => node.id).sort().join(",");
    if (fittedNodeIds.current === nodeIds) return;

    fittedNodeIds.current = nodeIds;
    const positions = nodes.map((node) => [node.latitude, node.longitude] as L.LatLngExpression);

    const [firstPosition] = positions;
    if (positions.length === 1 && firstPosition) {
      map.setView(firstPosition, 15);
      return;
    }

    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: 15 });
  }, [map, nodes]);

  return null;
}

function MapSummary({ nodes }: Pick<NodeMapProps, "nodes">) {
  const alertCount = nodes.filter((node) => node.status === "alert").length;
  const warningCount = nodes.filter((node) => node.status === "warning").length;

  return (
    <div className="pointer-events-none absolute left-14 top-14 z-[1000] rounded border border-canopy-600 bg-canopy-900/90 px-3 py-2.5 shadow-panel backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-canopy-400">Field network</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-canopy-100">{nodes.length}</span>
        <span className="font-mono text-[11px] uppercase text-canopy-300">deployed nodes</span>
      </div>
      {(alertCount > 0 || warningCount > 0) && (
        <p className="mt-1 font-mono text-[10px] text-signal-amber">
          {alertCount > 0 ? `${alertCount} critical` : `${warningCount} warning`} requiring attention
        </p>
      )}
    </div>
  );
}

export function NodeMap({ nodes, onSelectNode }: NodeMapProps) {
  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={MAP_DEFAULT_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/*<TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />*/}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <InitialNodeViewport nodes={nodes} />
        {nodes.map((node) => (
          <Marker
            key={node.id}
            position={[node.latitude, node.longitude]}
            icon={buildIcon(node)}
            eventHandlers={{ click: () => onSelectNode(node) }}
          >
            <Popup>
              <div className="min-w-[220px] p-3 font-sans">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs uppercase tracking-wide text-canopy-300">
                    {node.device_eui}
                  </p>
                  <span
                    className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase"
                    style={{
                      color: STATUS_COLORS[node.status],
                      backgroundColor: `${STATUS_COLORS[node.status]}1A`,
                    }}
                  >
                    {STATUS_LABELS[node.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-canopy-100">{node.name}</p>
                <p className="text-xs text-canopy-300">{node.forest_zone}</p>

                <div className="mt-2 flex items-center justify-between">
                  <BatteryIndicator percent={node.battery_pct} />
                  <SignalIndicator rssi={node.rssi_dbm} snr={node.snr_db} />
                </div>

                <p className="mt-2 font-mono text-[11px] text-canopy-400">
                  Last seen {timeAgo(node.last_seen_at)}
                </p>

                <button
                  onClick={() => onSelectNode(node)}
                  className="mt-2 w-full rounded bg-canopy-100 py-1.5 font-mono text-xs font-medium text-canopy-950 transition hover:bg-white"
                >
                  Inspect node
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <MapSummary nodes={nodes} />
    </div>
  );
}
