# CanvassCRM — architecture

```
┌──────────────────────── REP PHONE (Expo) ────────────────────────┐
│  MapLibre + Protomaps tiles                                       │
│  expo-location (background GPS, low-power)                        │
│  WatermelonDB (offline doors/knocks queue)                        │
│  expo-av (consent-aware audio capture)                            │
│  whisper.cpp (on-device ASR, ggml-small.en)                       │
│  → POST /functions/v1/intent-extract  (Claude Haiku)              │
│  ← intent JSON → upsert into Supabase                             │
│  Background: geofence watcher → callback push                     │
└──────────────┬─────────────────────────────┬──────────────────────┘
               │ realtime sync               │ object upload (encrypted)
               ▼                             ▼
┌──────────────────────── SUPABASE ────────────────────────┐
│  Postgres + PostGIS                                       │
│    • RLS by org_id                                        │
│    • spatial queries for "doors near me"                  │
│    • append-only audit_log                                │
│  Auth (magic link, Google, SSO via Jackson)               │
│  Storage (encrypted recordings, region-pinned)            │
│  Realtime (knocks, callbacks, leaderboard)                │
│  Edge Functions:                                          │
│    • intent-extract (Claude Haiku)                        │
│    • coach-tip (Claude Haiku, post-knock 3-sec tip)       │
│    • commission-calc (nightly)                            │
│    • purge-recordings (retention enforcement)             │
└──────────────┬─────────────────────────────┬──────────────┘
               │                             │
               ▼                             ▼
┌─── WEB ADMIN (Next 15) ───┐   ┌──── ENTERPRISE LAYER ────┐
│  Territories (draw poly)  │   │  BoxyHQ Jackson  (SSO)   │
│  Leaderboard              │   │  OpenFGA / Casbin (RBAC) │
│  Recordings audit         │   │  GlitchTip       (errors)│
│  Reports + exports        │   │  Inngest    (workflows)  │
│  Billing (Polar.sh)       │   │  Meilisearch    (search) │
│  Public share /s/<token>  │   │  Qdrant   (semantic)     │
└───────────────────────────┘   └──────────────────────────┘
```

## Data flow for one knock
1. Rep taps "Start convo" → expo-av records with consent TTS if 2-party state.
2. Audio chunks stream to whisper.cpp on device (GGML small.en model, ~80MB).
3. On stop: full transcript + recording uploaded to Supabase Storage (encrypted).
4. Edge fn `intent-extract` → returns JSON, written to `intents`.
5. If `outcome=callback` and `follow_up_at` present → insert into `callbacks`.
6. Door status updates → `doors.updated_at` triggers realtime broadcast → leaderboard re-renders.
7. Audit log row written for the recording read.

## Battery & data
- Background GPS in "balanced" mode = ~3% / hr
- Whisper on-device = no upload bandwidth needed
- Offline queue compresses → syncs only on Wi-Fi by default

## Why this is the wedge
- Existing tools (SalesRabbit, Spotio, Canvass.io) record GPS but **none do on-device ASR + LLM intent extraction**.
- ServiceTitan/Jobber are office-first, $200+/user, and don't think about door reps.
- CanvassCRM is mobile-first and 5x cheaper for the rep tier, but charges enterprise for SSO/audit/recording compliance — the same money flows.
