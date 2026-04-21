// SCRIPT SUGGEST — real-time AI earpiece for the rep.
// Called every time a new VAD chunk is finalized (every 10-30s during a
// live conversation). Returns the single best next line the rep should say,
// based on what the customer just said, the door's known objections/facts,
// the rep's current script stage, and what worked on this street before.
//
// The mobile app shows it as a subtle bottom-sheet card ("💬 Try saying…")
// that disappears in 8 seconds so it never distracts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are a real-time sales coach whispering into a door-to-door rep's earpiece.
The rep is in an ACTIVE conversation at the door RIGHT NOW.
Given the live transcript chunk + door memory + what's worked nearby, output one SHORT suggestion.

Rules:
- Output ONLY JSON: {"line":"...", "why":"...", "stage":"opener|rapport|pitch|objection|close|next_step"}
- "line" must be 1-2 sentences the rep can say WORD FOR WORD. Plain language, not salesy.
- "why" is a 6-word max coach note only the rep sees.
- Never reference the AI or this system.
- If the customer clearly said no / DNC, output {"line":null,"why":"Walk away","stage":"close"}.
- Match the customer's energy — if they're chatty, be conversational; if rushed, be crisp.`;

Deno.serve(async (req) => {
  const { transcript_chunk, door_id, org_id, stage, product } = await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull door memory + nearby win patterns in parallel
  const [memRes, winsRes] = await Promise.all([
    door_id
      ? supa.from("door_memory").select("*").eq("door_id", door_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supa
      .from("knock_transcripts")
      .select("text")
      .eq("org_id", org_id)
      .limit(8),
  ]);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: JSON.stringify({
          live_transcript: transcript_chunk,
          door_memory: memRes.data,
          nearby_winning_transcripts: winsRes.data?.map((t: any) => t.text),
          current_stage: stage ?? "unknown",
          product: product ?? "our service",
        }),
      }],
    }),
  });

  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "{}";
  return new Response(text, { headers: { "content-type": "application/json" } });
});
