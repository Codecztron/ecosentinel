# EcoSentinel — Anti-Illegal Logging Command Center

Built by **Santri Lab**, Universitas Jember.

A production-ready Next.js 15 command center for a LoRaWAN edge-sensor network
that detects illegal logging: chainsaw acoustic signatures, tree-fall/tilt
events, tamper conditions, and low-battery nodes, visualized in real time on
a geospatial dashboard backed by Supabase (PostGIS + Realtime).

## Stack

- **Next.js 15** (App Router, Server Actions, React 19)
- **Supabase**: Postgres + PostGIS, Row Level Security, Realtime (`postgres_changes`)
- **Tailwind CSS**, themed on Vercel's Geist design system: true-black surfaces, a tight neutral gray scale, Geist Sans/Geist Mono, and a single restrained blue accent (status colors — green/amber/red — stay reserved strictly for node/alert state)
- **react-leaflet** for the geospatial map (OpenStreetMap/CARTO dark tiles — no API key required)
- **Recharts** for historical telemetry charts
- Strict TypeScript throughout, no `any`


## Architecture

```
ESP32-S3 edge node (MEMS mic + IMU + GPS)
        │  LoRa uplink
        ▼
LoRaWAN network server (ChirpStack / The Things Network)
        │  HTTPS webhook, decoded JSON payload
        ▼
POST /api/ingest  (Bearer-secret authenticated)
        │  supabase.rpc('ingest_telemetry', ...)
        ▼
Postgres: telemetry table
        │  AFTER INSERT trigger → rolls up node status, derives alerts
        ▼
nodes / alerts tables
        │  Supabase Realtime (logical replication)
        ▼
Next.js dashboard (useRealtimeNodes / useRealtimeAlerts / useNodeTelemetryHistory)
```

The browser **never** talks to Postgres with elevated privileges. Edge-node
data only ever enters the system through `/api/ingest`, authenticated with a
shared secret and written via the Supabase **service role** key, which is
used exclusively on the server. Every other read/write path (login, alert
acknowledgement, node notes) goes through RLS-protected, `authenticated`-role
policies.

## Getting started

### Option A: Run instantly with no backend (demo mode)

```bash
npm install
npm run dev
```

That's it — if `NEXT_PUBLIC_SUPABASE_URL` isn't set, the app automatically
runs against an in-memory simulator (`src/lib/demo/store.ts`) instead of
Supabase.

### Option B: Connect a real Supabase backend

#### 1. Install dependencies

```bash
npm install
```

#### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com) (or run one locally
with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase init && supabase start`).

#### 3. Apply the database schema

Using the Supabase CLI against a linked project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste the contents of `supabase/migrations/0001_init.sql` directly into
the SQL editor in the Supabase dashboard.

This creates:
- `nodes`, `telemetry`, `alerts` tables with PostGIS `geography(point, 4326)` columns
- The `nodes_with_coords` and `node_latest_telemetry` views (flatten geography → plain lat/lng)
- The `ingest_telemetry()` RPC used by the ingest API route
- A trigger that rolls telemetry up onto `nodes.status` and auto-derives `alerts` rows
  when acoustic confidence, tilt, impact, or battery cross their thresholds
- Row Level Security policies (`authenticated` can read everything and
  acknowledge/resolve alerts; only the `service_role` key can write telemetry)
- Realtime publication for all three tables

#### 4. (Optional) Seed sample data for local development

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/seed.sql
```

This creates five nodes across three forest zones and six hours of synthetic
telemetry, including one node (`Node Charlie`) actively spiking into a
chainsaw + tree-fall event so the dashboard has something live to show.

#### 5. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page (keep this secret; never commit it or expose it client-side)
- `INGEST_SHARED_SECRET` — any long random string; your LoRaWAN network server sends this back as a Bearer token

#### 6. Enable Realtime on the tables (dashboard projects only)

If you applied the migration via the SQL editor rather than `supabase db push`,
double check in **Database → Replication** that `nodes`, `telemetry`, and
`alerts` are all added to the `supabase_realtime` publication 

#### 7. Create an operator account

The dashboard follows the RLS policies in the migration and requires an
authenticated Supabase user. In **Authentication → Users**, add an operator
with an email address and password, then use those credentials at the dashboard
sign-in screen.

#### 8. Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`.

## ESP32 LoRa gateway → Supabase

The field gateway sketch (`gatewat_gemastik.ino`) forwards each LoRa packet to
the deployed application's HTTPS ingest endpoint:

```
LoRa sensor node → ESP32 gateway → POST /api/ingest → Supabase → dashboard Realtime
```

The ESP32 must **not** receive `SUPABASE_SERVICE_ROLE_KEY`. It only holds the
separate `INGEST_SHARED_SECRET`; the server validates that secret and writes to
Supabase with the service-role key kept in its server environment.

### Gateway setup

1. Deploy this Next.js application to a public HTTPS domain and configure all
   variables from `.env.local` in the deployment environment.
2. In `gatewat_gemastik.ino`, set `WIFI_SSID`, `WIFI_PASS`, `INGEST_URL` to
   `https://<your-domain>/api/ingest`, and `INGEST_SHARED_SECRET` to the exact
   server value.
3. Each LoRa node `id` must match a `nodes.device_eui` row. For a new node,
   register it before sending telemetry:

   ```sql
   insert into public.nodes (
     device_eui, name, forest_zone, install_location, current_location
   ) values (
     'NODE-001', 'Node 001', 'Zone A',
     st_point(112.752100, -7.257500)::geography,
     st_point(112.752100, -7.257500)::geography
   );
   ```

4. Upload the sketch. Its serial monitor reports `Telemetry stored (201)` once
   an uplink has been accepted.

The gateway accepts the LoRa payload it already receives:

```json
{
  "id": "NODE-001",
  "lat": -7.2575,
  "lon": 112.7521,
  "st": 1,
  "db": 82.4,
  "vib": 2.1,
  "mv": -0.48,
  "ps": 0.91,
  "pg": 0.23,
  "pb": 0.17
}
```

`ps` becomes chainsaw confidence, `vib` is converted from m/s² to g, and
`st` is retained in the raw event. Status `1`, `2`, and `3` also establish the
minimum alert level for chainsaw, disturbance, and confirmed multi-sensor
events respectively.

## Wiring up real ESP32-S3 nodes

1. Register each device in the `nodes` table with its `device_eui` matching
   the LoRaWAN DevEUI burned into the ESP32-S3, plus a fixed `install_location`.
2. Point your LoRaWAN network server's uplink webhook (ChirpStack "HTTP
   integration" or TTN "Webhooks") at `https://<your-domain>/api/ingest`,
   with header `Authorization: Bearer <INGEST_SHARED_SECRET>`.
3. Your uplink decoder should produce a JSON body shaped like:

```json
{
  "device_eui": "70B3D57ED0048A11",
  "latitude": 0.53211,
  "longitude": 101.64213,
  "battery_pct": 87,
  "rssi_dbm": -82,
  "snr_db": 7.4,
  "temperature_c": 27.1,
  "humidity_pct": 78,
  "tilt_deg": 2.3,
  "tilt_delta_deg": 0.4,
  "impact_g": 0.15,
  "acoustic_confidence": 0.08,
  "acoustic_db": 41.2,
  "raw_payload": { "fPort": 2, "fCnt": 1032 }
}
```

`device_eui`, `latitude`, `longitude`, `battery_pct`, `rssi_dbm`, and
`snr_db` are required; everything else is optional and defaults sensibly.
The insert trigger derives `alerts` automatically:

| Condition | Alert |
|---|---|
| `acoustic_confidence >= 0.55` | `chainsaw` (critical at `>= 0.85`) |
| `tilt_deg >= 15` or `impact_g >= 1.2` | `tree_fall` (critical at `tilt_deg >= 35` or `impact_g >= 2.5`) |
| `battery_pct <= 15` | `low_battery` |

You can test the endpoint manually:

```bash
curl -X POST https://<your-domain>/api/ingest \
  -H "Authorization: Bearer <INGEST_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"device_eui":"70B3D57ED0048A11","latitude":0.53211,"longitude":101.64213,"battery_pct":87,"rssi_dbm":-82,"snr_db":7.4,"acoustic_confidence":0.91,"tilt_deg":38}'
```

## Project structure

```
src/
  app/
    actions.ts              Server Actions: acknowledge/resolve alerts, node notes
    api/ingest/route.ts      Edge-node telemetry ingest webhook
    page.tsx                 Dashboard: map + alert feed + drawer
    layout.tsx, globals.css
  components/
    layout/                  Header, StatsBar
    map/                     Leaflet map, legend, SSR-safe dynamic wrapper
    alerts/                  Live alert feed + item cards
    node/                    Inspection drawer, gauges, battery/signal indicators
    charts/                  Recharts historical tilt/acoustic/signal panels
    ui/                      StatusBadge, EmptyState, LoadingSpinner
  hooks/
    useRealtimeNodes.ts        Live node list from `nodes_with_coords`
    useRealtimeAlerts.ts       Live alert feed
    useNodeTelemetryHistory.ts Live per-node telemetry history for charts/gauges
  lib/
    supabase/                client.ts, server.ts (incl. service-role client), middleware.ts
    constants.ts, utils.ts
  types/database.types.ts    Hand-authored types mirroring the SQL schema
  middleware.ts               Refreshes the Supabase auth session
supabase/
  migrations/0001_init.sql    Full schema: tables, views, trigger, RLS, Realtime
  seed.sql                    Local dev sample data
```

## Credits

**EcoSentinel** is built and maintained by **Ananta Pamungkas** for Santri lab team Universitas Jember.
