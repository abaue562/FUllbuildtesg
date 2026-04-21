// CRM-SYNC — bidirectional bridge between CanvassCRM and any external CRM.
//
// INBOUND  (CRM → CanvassCRM): maps CRM contacts/deals into doors + addresses.
// OUTBOUND (CanvassCRM → CRM): fires webhooks on every knock/sale/callback event.
//
// Org settings row controls which CRM adapter runs and what gets synced.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Inbound handler ──────────────────────────────────────────────────────
async function handleInbound(orgId: string, event: string, data: any) {
  if (event === "contact.created" || event === "contact.updated") {
    // Upsert address
    const { data: addr } = await supa.from("addresses").upsert({
      org_id: orgId,
      external_id: data.external_id,
      line1: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
    }, { onConflict: "org_id,external_id" }).select("id").single();

    // Upsert door
    if (addr?.id) {
      await supa.from("doors").upsert({
        org_id: orgId,
        address_id: addr.id,
        external_crm_id: data.external_id,
      }, { onConflict: "org_id,address_id" });
    }

    // Upsert contact facts (phone, email, tags)
    if (addr?.id && (data.phone || data.email)) {
      await supa.from("door_facts").upsert([
        data.phone && { org_id: orgId, key: "phone", value: data.phone, confidence: 1 },
        data.email && { org_id: orgId, key: "email", value: data.email, confidence: 1 },
        ...(data.tags ?? []).map((t: string) => ({ org_id: orgId, key: "tag", value: t, confidence: 1 })),
      ].filter(Boolean));
    }
  }
}

// ── Outbound webhook ─────────────────────────────────────────────────────
async function fireWebhook(orgSettings: any, event: string, payload: any) {
  if (!orgSettings?.crm_webhook_url) return;
  const res = await fetch(orgSettings.crm_webhook_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CanvassCRM-Event": event,
      "X-CanvassCRM-Org": payload.org_id,
      ...(orgSettings.crm_api_key
        ? { Authorization: `Bearer ${orgSettings.crm_api_key}` }
        : {}),
    },
    body: JSON.stringify({ event, data: payload, ts: new Date().toISOString() }),
  });
  // Log delivery status
  await supa.from("audit_log").insert({
    org_id: payload.org_id,
    action: `crm_webhook:${event}`,
    detail: { status: res.status, url: orgSettings.crm_webhook_url },
  });
}

// ── CRM adapter: Jobber ──────────────────────────────────────────────────
async function syncToJobber(settings: any, event: string, data: any) {
  if (!settings.jobber_api_key) return;
  // Jobber GraphQL API
  const mutation = event === "sale.created"
    ? `mutation { createJob(input: { clientId: "${data.external_crm_id}", title: "${data.product}", total: ${data.amount} }) { job { id } } }`
    : null;
  if (!mutation) return;
  await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.jobber_api_key}`,
    },
    body: JSON.stringify({ query: mutation }),
  });
}

// ── CRM adapter: HubSpot ─────────────────────────────────────────────────
async function syncToHubspot(settings: any, event: string, data: any) {
  if (!settings.hubspot_token) return;
  if (event === "knock.updated" && data.intent?.summary) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.hubspot_token}`,
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: `[CanvassCRM] ${data.intent.summary}`,
          hs_timestamp: new Date().toISOString(),
        },
      }),
    });
  }
}

// ── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const { org_id, direction, event, data } = await req.json();
  if (!org_id || !event) return new Response("missing params", { status: 400 });

  const { data: settings } = await supa
    .from("org_settings")
    .select("crm_webhook_url,crm_api_key,crm_type,jobber_api_key,hubspot_token,sync_contacts,sync_deals,sync_transcripts")
    .eq("org_id", org_id)
    .maybeSingle();

  if (direction === "inbound") {
    await handleInbound(org_id, event, data);
    return new Response("ok");
  }

  // Outbound: fire webhook + adapter
  await fireWebhook(settings, event, { ...data, org_id });
  if (settings?.crm_type === "jobber") await syncToJobber(settings, event, data);
  if (settings?.crm_type === "hubspot") await syncToHubspot(settings, event, data);

  return new Response("ok");
});
