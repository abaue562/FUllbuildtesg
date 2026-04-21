# CanvassCRM — AI-native door-to-door field CRM

**Wedge:** ServiceTitan + Jobber are office-first. Door-to-door reps work with paper, screenshots, and memory. CanvassCRM is rep-first: open the app, walk the street, every door is auto-tracked, every conversation is auto-transcribed, every "come back Tuesday" is auto-scheduled.

**ICP:** Solar, roofing, pest control, alarms, HVAC, fiber/ISP, political canvassing, religious outreach. 5–500 reps.

**ACV target:** $25k base + $75/rep/mo. Sold to ops directors, not reps.

## Killer features (MVP)
1. **Live street map** — rep walks, GPS pins drop on every door automatically. Houses change color by status (knocked, no-answer, not-home, callback, sold, no-soliciting).
2. **One-tap door log** — Knocked / No answer / Callback / Sold / Not interested / DNC. Each tap is < 200ms.
3. **Conversation recording (consent-aware)** — On tap, records audio. On-device Whisper transcribes. Claude Haiku extracts: outcome, follow-up date, objections, decision-maker, family situation, budget signals.
4. **Auto-callback scheduler** — "Come back Tuesday at 6" → auto creates a calendar pin, GPS notify when nearby on Tuesday.
5. **Territory assignment** — Manager draws polygons, assigns reps. No two reps on same street.
6. **Leaderboard + commission tracker** — Real-time, gamified, with payout export.
7. **Offline-first** — Reps work in basements and dead zones. Sync when back.
8. **AI coach** — After each door, 3-second tip in earpiece: "She mentioned her son. Lead with family safety next door."

## Enterprise hooks (default-on)
- BoxyHQ Jackson SSO + SCIM
- Append-only audit log (compliance for recorded calls)
- Casbin RBAC (rep / lead / manager / admin / auditor)
- Data residency (US / EU / CA)
- Self-host option (Docker Compose) → big wedge for security-conscious enterprises
- Per-state consent rules engine for recording (1-party vs 2-party states)

## Stack (real OSS, MIT/Apache)
| Layer | Tool | License | Why |
|---|---|---|---|
| Mobile | Expo SDK 52 + expo-router | MIT | Cross-platform, OTA updates |
| Maps | MapLibre GL Native | BSD | Free, self-hostable tiles |
| Tiles | Protomaps + tippecanoe | BSD | Single-file vector tiles, no Mapbox bill |
| Local DB | WatermelonDB | MIT | Offline-first, sync engine |
| Auth | Supabase Auth | Apache-2.0 | Magic link + OAuth |
| Backend | Supabase (Postgres+Realtime+Storage+Edge Fns) | Apache-2.0 | One container, RLS-ready |
| Audio capture | expo-av | MIT | Cross-platform record |
| ASR | whisper.cpp on-device + Whisper-v3 server fallback | MIT | Free, private |
| LLM | Claude Haiku 4.5 (via ai-proxy) | API | Latency + cost |
| Workflows | Inngest | Apache-2.0 | Event-driven jobs |
| Search | Meilisearch | MIT | Instant search across leads/notes |
| Vector | Qdrant | Apache-2.0 | Semantic search of conversations |
| Telephony | Fonoster | MIT | Outbound + recording fallback |
| SMS | TextBee + Twilio fallback | MIT | Auto follow-up texts |
| Maps geocoding | Nominatim (OSM) | various | Free reverse geocode |
| Analytics | PostHog | MIT | Funnels, session replay (web admin) |
| SSO/SCIM | BoxyHQ Jackson | Apache-2.0 | Enterprise unlock |
| Authz | Casbin | Apache-2.0 | RBAC |
| Errors | GlitchTip | MIT | Sentry-compatible, self-host |
| Web admin | Next.js 15 + shadcn/ui | MIT | Manager dashboard |
| Charts | Recharts | MIT | Leaderboard, funnels |
| Payments | Polar.sh | Apache-2.0 | Self-serve subs (managed plan) |

## Schema (Supabase / Postgres)
See `supabase/migrations/001_init.sql`.

Tables: orgs, users, territories (with PostGIS polygon), addresses (PostGIS point), doors, knocks, recordings, transcripts, intents, callbacks, sales, commissions, audit_log, referral_codes, referrals.

PostGIS extension enables spatial queries: "doors within 50m of rep right now", "addresses inside territory polygon", "callbacks where rep is currently within 100m and time is within window".

## 14-day MVP scope
- Day 1–2: Supabase + PostGIS schema, RLS, ai-proxy edge fn
- Day 3–5: Expo app shell, login, MapLibre + Protomaps tiles, GPS tracking
- Day 6–7: Door tap-log, offline queue (WatermelonDB), sync
- Day 8–9: Audio record + on-device Whisper + Claude intent extraction
- Day 10: Auto-callback geofence + push
- Day 11: Web admin (Next 15) — territories, leaderboard, audit
- Day 12: BoxyHQ SSO + audit log + Casbin
- Day 13: Polar.sh billing + landing page (Astro)
- Day 14: Launch kit (PH + HN + outbound)

## Recording compliance
- On install: state detection → if 2-party, force "Recording is on" announcement TTS at start of every recording.
- Per-org policy table: `recording_mode` ∈ {disabled, transcript-only, full}.
- All recordings encrypted at rest (Postgres pgcrypto) + audit-logged on every read.
- Auto-purge after `retention_days` (default 30).

## Viral mechanics wired
- Referral: every rep gets a recruit link → org gets credit when new rep signs up
- "Built on CanvassCRM" badge in lead-receipt PDFs
- Public leaderboard share (`/s/<token>`) — reps post their week's stats to social
- Programmatic SEO: `/canvassing-software-for-<vertical>/<city>` (10k pages)

## Pricing (sales-led)
- **Starter**: $499/mo, 5 reps, no SSO, no recording
- **Pro**: $99/rep/mo, includes recording + AI coach
- **Enterprise**: $25k/yr base + $75/rep — SSO/SCIM, audit, residency, self-host, SLA, dedicated CSM
