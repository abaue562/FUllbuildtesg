// After a sale, ask Claude Haiku for the top 3 upsells based on transcript + neighbors.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SYSTEM = `You are a senior sales coach for door-to-door home services.
Given a transcript, the product just sold, and neighbors' purchase history, return STRICT JSON:
{"suggestions":[{"product":"string","reason":"1 sentence","confidence":0.0-1.0}]}
Up to 3. No prose. Realistic upsells only (warranty, maintenance plan, addon panel, monitoring, financing upgrade).`;

serve(async (req) => {
  const { enrollment } = await req.json();
  const dealId = enrollment?.deal_id;
  if (!dealId) return new Response("no deal", { status: 400 });

  const { data: deal } = await sb.from("deals").select("*, customers(*)").eq("id", dealId).single();
  const { data: transcripts } = await sb.from("transcripts").select("text")
    .eq("recording_id", deal?.recording_id ?? "00000000-0000-0000-0000-000000000000");
  const transcript = transcripts?.[0]?.text ?? "(no transcript)";

  // Neighbors: same postal, last 90 days
  const { data: neighbors } = await sb.from("deals")
    .select("product, amount_cents")
    .eq("org_id", deal!.org_id)
    .neq("id", dealId)
    .limit(20);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `PRODUCT_SOLD: ${deal!.product} ($${deal!.amount_cents/100})\nTRANSCRIPT:\n${transcript}\n\nNEIGHBORS:\n${JSON.stringify(neighbors)}`,
      }],
    }),
  });
  const data = await r.json();
  const text = (data?.content?.[0]?.text ?? "{}").replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(text);

  for (const s of parsed.suggestions ?? []) {
    await sb.from("upsell_suggestions").insert({
      org_id: deal!.org_id,
      deal_id: dealId,
      product: s.product,
      reason: s.reason,
      confidence: s.confidence,
    });
  }
  return new Response(JSON.stringify(parsed), { headers: { "content-type": "application/json" } });
});
