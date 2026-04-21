# CanvassCRM — Plugin Architecture

## What This Is

CanvassCRM is built as a **standalone plugin** that connects to any CRM via a
universal webhook + REST API bridge. You sell it as an add-on to your main app
OR as a standalone product. Either way the data flows both directions.

---

## How the Plugin Connects

```
Your CRM App
     │
     │  REST API / Webhooks
     ▼
CanvassCRM Plugin API  (Supabase Edge Functions)
     │
     ├── Pushes door data, transcripts, callbacks, sales →  Your CRM
     └── Pulls contacts, deals, territories, products  ←  Your CRM
```

---

## Integration Points

### 1. Outbound (CanvassCRM → Your CRM)
Every significant event fires a webhook to a URL you configure:

| Event | Payload |
|-------|---------|
| `knock.created` | door_id, address, outcome, lat, lng, weather, timestamp |
| `knock.updated` | knock_id, new status, transcript summary, intent JSON |
| `callback.created` | door_id, address, callback_at, reason, decision_maker |
| `sale.created` | door_id, address, amount, product, rep, signature_id |
| `transcript.ready` | knock_id, full transcript text, audio_url |
| `door.flagged` | door_id, flag (dnc / no_soliciting / dog_warning) |

### 2. Inbound (Your CRM → CanvassCRM)
POST to `https://your-supabase.functions.supabase.co/crm-sync` with:

```json
{
  "event": "contact.created",
  "data": {
    "external_id": "crm-contact-123",
    "name": "John Smith",
    "address": "123 Maple St",
    "city": "Salt Lake City",
    "state": "UT",
    "zip": "84101",
    "phone": "+18015551234",
    "email": "john@example.com",
    "tags": ["warm_lead", "solar_interested"]
  }
}
```

### 3. OAuth App (sell as a marketplace plugin)
CanvassCRM registers as an OAuth 2.0 app. Customers connect it in one click
from your CRM's app marketplace. Scopes: `doors:read`, `doors:write`,
`transcripts:read`, `callbacks:write`, `sales:read`.

---

## CRM-Sync Edge Function

```
supabase/functions/crm-sync/index.ts
```

Handles both directions:
- Inbound: maps CRM contact → CanvassCRM address + door record
- Outbound: fires webhooks to the CRM's webhook URL on every event

Configure via org settings:
```json
{
  "crm_webhook_url": "https://your-crm.com/webhooks/canvasscrm",
  "crm_api_key": "...",
  "crm_type": "jobber | salesforce | hubspot | custom",
  "sync_contacts": true,
  "sync_deals": true,
  "sync_transcripts": false
}
```

---

## Supported CRM Adapters (built-in)

| CRM | Status | Notes |
|-----|--------|-------|
| Jobber | ✅ Ready | Job + quote + client sync |
| HubSpot | ✅ Ready | Contact + deal + note sync |
| Salesforce | ✅ Ready | Lead + opportunity + task |
| GoHighLevel | ✅ Ready | Contact + opportunity + SMS |
| Custom Webhook | ✅ Ready | Any CRM with webhooks |
| Zapier | 🔜 Planned | Via Zapier trigger/action |

---

## Selling It

**Option A — Standalone SaaS**
Sell CanvassCRM on its own at $25k/yr base + $75/rep/mo.
Customers connect their existing CRM via webhooks.

**Option B — Plugin/Add-on**
List on your CRM's app marketplace. One-click OAuth install.
Revenue share or flat monthly per connected org.

**Option C — White Label**
License the full stack. Customer's brand, your engine.
$50k setup + 20% of ARR.
