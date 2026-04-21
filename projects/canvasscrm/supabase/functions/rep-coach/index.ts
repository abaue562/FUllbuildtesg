// REP-COACH — End-of-shift Claude Haiku coaching report.
// Pulls today's knocks + transcripts + objections for one rep, then asks
// Claude to produce: top 3 wins, top 3 misses, the one objection they didn't
// handle, a custom rebuttal, and tomorrow's drill.
//
// Triggered by: shift_sessions.ended_at insert OR scheduled at 9 PM local.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";

Deno.serve(async (req) => {
  const { user_id, org_id, date } = await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const day = date ?? new Date().toISOString().slice(0, 10);

  const { data: knocks } = await supa
    .from("knocks")
    .select("status,sentiment,buying_signal,summary,captured_at")
    .eq("user_id", user_id).eq("org_id", org_id)
    .gte("captured_at", `${day}T00:00:00`)
    .lte("captured_at", `${day}T23:59:59`);

  const { data: objections } = await supa
    .from("door_objections")
    .select("text,category")
    .eq("org_id", org_id)
    .gte("created_at", `${day}T00:00:00`);

  const { data: transcripts } = await supa
    .from("knock_transcripts")
    .select("text")
    .eq("org_id", org_id)
    .gte("created_at", `${day}T00:00:00`)
    .limit(40);

  const stats = {
    total: knocks?.length ?? 0,
    sales: knocks?.filter((k: any) => k.status === "sold").length ?? 0,
    callbacks: knocks?.filter((k: any) => k.status === "callback").length ?? 0,
    interested: knocks?.filter((k: any) => k.status === "interested").length ?? 0,
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system:
        "You are an elite door-to-door sales coach. Read today's shift data and " +
        "produce a SHORT, motivating, specific coaching report. Output JSON: " +
        '{"score":0-100,"wins":[3 strings],"misses":[3 strings],' +
        '"unhandled_objection":"...","rebuttal":"...","tomorrow_drill":"..."}.',
      messages: [{
        role: "user",
        content: JSON.stringify({ stats, objections, transcripts }),
      }],
    }),
  });
  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "{}";

  return new Response(text, { headers: { "content-type": "application/json" } });
});
