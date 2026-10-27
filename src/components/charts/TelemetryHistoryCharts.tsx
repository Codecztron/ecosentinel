"use client";

import type { TelemetryRow } from "@/types/database.types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface TelemetryHistoryChartsProps {
  history: TelemetryRow[];
  isLoading: boolean;
}

export function TelemetryHistoryCharts({ history, isLoading }: TelemetryHistoryChartsProps) {
  if (isLoading && history.length === 0) {
    return <LoadingSpinner label="Memuat riwayat telemetri…" />;
  }

  if (history.length === 0) {
    return (
      <p className="font-mono text-xs text-canopy-400">
        Belum ada data riwayat telemetri 6 jam terakhir.
      </p>
    );
  }

  // Memetakan data riwayat dengan mengambil parameter acoustic_db, vibration, dan bio_mv
  const chartData = [...history].reverse().map((item) => {
    const raw = (item.raw_payload ?? {}) as Record<string, unknown>;
    const lora = (raw.lora ?? {}) as Record<string, unknown>;

    const timeLabel = new Date(item.recorded_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const acousticDb =
      item.acoustic_db ??
      (lora.db as number) ??
      (raw.acoustic_db as number) ??
      0;

    const vibration =
      item.vibration ??
      item.impact_g ??
      (lora.vib as number) ??
      (raw.impact_g as number) ??
      0;

    const bioMv =
      item.bio_mv ??
      (lora.mv as number) ??
      (raw.bio_mv as number) ??
      0;

    return {
      timestamp: timeLabel,
      acoustic_db: acousticDb,
      vibration: vibration,
      bio_mv: bioMv,
    };
  });

  return (
    <div className="space-y-4">
      {/* Grafik 1: Acoustic dB */}
      <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs font-medium text-canopy-200">
            Acoustic Signal (dB)
          </span>
          <span className="font-mono text-[10px] text-[#EE0000]">Akustik (dB)</span>
        </div>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorAcoustic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EE0000" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#EE0000" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="timestamp" stroke="#94A3B8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: "4px", fontSize: "11px" }}
                labelStyle={{ color: "#94A3B8" }}
              />
              <Area type="monotone" dataKey="acoustic_db" stroke="#EE0000" fillOpacity={1} fill="url(#colorAcoustic)" name="Acoustic (dB)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grafik 2: Vibration (g) */}
      <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs font-medium text-canopy-200">
            Vibration Impact (Ms2)
          </span>
          <span className="font-mono text-[10px] text-[#3291FF]">Getaran (Ms2)</span>
        </div>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorVib" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3291FF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3291FF" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="timestamp" stroke="#94A3B8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: "4px", fontSize: "11px" }}
                labelStyle={{ color: "#94A3B8" }}
              />
              <Area type="monotone" dataKey="vibration" stroke="#3291FF" fillOpacity={1} fill="url(#colorVib)" name="Vibration (g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grafik 3: Bio Potential (mV) */}
      <div className="rounded border border-canopy-600 bg-canopy-800/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs font-medium text-canopy-200">
            Bio Potential (mV)
          </span>
          <span className="font-mono text-[10px] text-[#F5A623]">Tegangan (mV)</span>
        </div>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5A623" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#F5A623" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="timestamp" stroke="#94A3B8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: "4px", fontSize: "11px" }}
                labelStyle={{ color: "#94A3B8" }}
              />
              <Area type="monotone" dataKey="bio_mv" stroke="#F5A623" fillOpacity={1} fill="url(#colorBio)" name="Bio Potential (mV)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
