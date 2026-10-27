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
  vibration?: number;
  vibration_confidence?: number;
  bio_mv?: number;
  bio_confidence?: number;
  status_level?: number;
  gateway_id?: string;
  gateway_packet?: number;
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

function normalizePayload(body: unknown): IngestPayload | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const rawRecord = body as Record<string, unknown>;
  const loraRecord =
    typeof rawRecord.lora === "object" && rawRecord.lora !== null && !Array.isArray(rawRecord.lora)
      ? (rawRecord.lora as Record<string, unknown>)
      : {};

  const record = { ...rawRecord, ...loraRecord };

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

  const vibrationMs2 = numberField(record, "vibration_ms2", "vib", "vibration");
  const sourceStatus = numberField(record, "status_level", "source_status", "st", "status_code");

  const acousticConfidence = clamp(
    numberField(record, "acoustic_confidence", "sound_probability", "ps") ?? 0,
    0,
    1
  );

  const impactG = Math.max(
    0,
    numberField(record, "impact_g") ??
      (vibrationMs2 === null ? 0 : Math.abs(vibrationMs2) / STANDARD_GRAVITY_MS2)
  );

  const temperature = numberField(record, "temperature_c", "temperature");
  const humidity = numberField(record, "humidity_pct", "humidity");
  const acousticDb = numberField(record, "acoustic_db", "db");
  const bioMv = numberField(record, "bio_mv", "mv");
  const bioConfidence = numberField(record, "bio_confidence", "pb");
  const vibrationConfidence = numberField(record, "vibration_confidence", "pg");
  const gatewayPacket = numberField(rawRecord, "gateway_packet");
  const gatewayId = typeof rawRecord.gateway_id === "string" ? rawRecord.gateway_id : undefined;

  return {
    device_eui: deviceEui,
    latitude,
    longitude,
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
    vibration: vibrationMs2 === null ? undefined : vibrationMs2,
    vibration_confidence: vibrationConfidence === null ? undefined : clamp(vibrationConfidence, 0, 1),
    bio_mv: bioMv === null ? undefined : bioMv,
    bio_confidence: bioConfidence === null ? undefined : clamp(bioConfidence, 0, 1),
    status_level: sourceStatus === null ? undefined : sourceStatus,
    gateway_id: gatewayId,
    gateway_packet: gatewayPacket === null ? undefined : gatewayPacket,
    raw_payload: rawRecord,
  };
}

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
      { error: "Invalid payload. Required: device_eui (or id), latitude (or lat), and longitude (or lon)." },
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
    p_status_level: payload.status_level ?? 0,
    p_raw_payload: payload.raw_payload,
  });

  if (error) {
    console.error("ingest_telemetry RPC failed:", error);
    const status = error.message.includes("Unknown device_eui") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ telemetry_id: data, data: payload }, { status: 201 });
}
