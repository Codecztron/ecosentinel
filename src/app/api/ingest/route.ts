import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

const STANDARD_GRAVITY_MS2 = 9.80665;

interface IngestPayload {
  device_eui: string;
  latitude: number;
  longitude: number;
  battery_pct: number;
  rssi_dbm: number;
  snr_db: number;
  temperature_c?: number;
  humidity_pct?: number;
  tilt_deg: number;
  tilt_delta_deg: number;
  impact_g: number;
  acoustic_confidence: number;
  acoustic_db?: number;
  raw_payload: Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberField(record: Record<string, unknown>, ...names: string[]): number | null {
  for (const name of names) {
    const value = finiteNumber(record[name]);
    if (value !== null) return value;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Supports both the documented telemetry contract and the compact packet
 * forwarded by `gatewat_gemastik.ino`:
 * { id, lat, lon, st, db, vib, mv, ps, pg, pb }
 */
function normalizePayload(body: unknown): IngestPayload | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const deviceValue =
    typeof record.device_eui === "string"
      ? record.device_eui
      : typeof record.id === "string"
        ? record.id
        : "";
  const deviceEui = deviceValue.trim();
  const latitude = numberField(record, "latitude", "lat");
  const longitude = numberField(record, "longitude", "lon");

  if (
    !deviceEui ||
    deviceEui.length > 128 ||
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const vibrationMs2 = numberField(record, "vibration_ms2", "vib");
  const sourceStatus = numberField(record, "source_status", "st", "status_code");
  let acousticConfidence = clamp(
    numberField(record, "acoustic_confidence", "sound_probability", "ps") ?? 0,
    0,
    1
  );
  let impactG = Math.max(
    0,
    numberField(record, "impact_g") ??
      (vibrationMs2 === null ? 0 : Math.abs(vibrationMs2) / STANDARD_GRAVITY_MS2)
  );

  // Classifier statuses: 1 = chainsaw, 2 = manual/tree disturbance,
  // 3 = confirmed multi-sensor event. They meet DB alert thresholds while
  // raw readings remain available in raw_payload.
  if (sourceStatus === 1) acousticConfidence = Math.max(acousticConfidence, 0.55);
  if (sourceStatus === 2) impactG = Math.max(impactG, 1.2);
  if (sourceStatus === 3) {
    acousticConfidence = Math.max(acousticConfidence, 0.85);
    impactG = Math.max(impactG, 2.5);
  }

  const rawPayload =
    typeof record.raw_payload === "object" && record.raw_payload !== null && !Array.isArray(record.raw_payload)
      ? (record.raw_payload as Record<string, unknown>)
      : record;
  const temperature = numberField(record, "temperature_c", "temperature");
  const humidity = numberField(record, "humidity_pct", "humidity");
  const acousticDb = numberField(record, "acoustic_db", "db");

  return {
    device_eui: deviceEui,
    latitude,
    longitude,
    // Current LoRa packet may omit radio/battery metrics. These defaults are
    // replaced automatically when the node firmware starts supplying them.
    battery_pct: clamp(numberField(record, "battery_pct", "battery") ?? 100, 0, 100),
    rssi_dbm: Math.round(numberField(record, "rssi_dbm", "rssi") ?? -100),
    snr_db: numberField(record, "snr_db", "snr") ?? 0,
    temperature_c: temperature === null ? undefined : temperature,
    humidity_pct: humidity === null ? undefined : clamp(humidity, 0, 100),
    tilt_deg: Math.max(0, numberField(record, "tilt_deg", "tilt") ?? 0),
    tilt_delta_deg: numberField(record, "tilt_delta_deg") ?? 0,
    impact_g: impactG,
    acoustic_confidence: acousticConfidence,
    acoustic_db: acousticDb === null ? undefined : acousticDb,
    raw_payload: rawPayload,
  };
}

/**
 * Authenticated ESP32 gateway ingress. The gateway sends a bearer secret;
 * the Supabase service-role key remains on this server, never on hardware.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  }

  const expectedSecret = process.env.INGEST_SHARED_SECRET;
  if (!expectedSecret) {
    console.error("INGEST_SHARED_SECRET is not configured on the server.");
    return NextResponse.json({ error: "Ingest endpoint misconfigured." }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid payload. Required: device_eui, latitude/lat, and longitude/lon." },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("ingest_telemetry", {
    p_device_eui: payload.device_eui,
    p_latitude: payload.latitude,
    p_longitude: payload.longitude,
    p_battery_pct: payload.battery_pct,
    p_rssi_dbm: payload.rssi_dbm,
    p_snr_db: payload.snr_db,
    p_temperature_c: payload.temperature_c ?? null,
    p_humidity_pct: payload.humidity_pct ?? null,
    p_tilt_deg: payload.tilt_deg,
    p_tilt_delta_deg: payload.tilt_delta_deg,
    p_impact_g: payload.impact_g,
    p_acoustic_confidence: payload.acoustic_confidence,
    p_acoustic_db: payload.acoustic_db ?? null,
    p_raw_payload: payload.raw_payload,
  });

  if (error) {
    console.error("ingest_telemetry RPC failed:", error);
    const status = error.message.includes("Unknown device_eui") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ telemetry_id: data }, { status: 201 });
}
