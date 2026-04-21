// INTENT EXTRACT — Claude Haiku 4.5
// Reads a transcript chunk + the door's prior memory and returns a strict
// JSON payload that the writer fans out into door_callbacks, door_questions,
// door_objections, door_facts, and a knock summary.
//
// Triggered by: hands-free VAD finalization, manual stop-recording, and
// the door detail modal.
//
// Deploy: supabase functions deploy intent-extract

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const SYSTEM = `You are an extraction engine for a door-to-door sales CRM.
Read the transcript of a brief porch conversation between a sales rep and a
prospect. Output STRICT JSON only — no prose, no code fences. Schema:

{
  "outcome": "no_answer|not_home|callback|interested|sold|not_interested|dnc|spanish_only|language_barrier",
  "sentiment": "pos|neutral|neg",
  "buying_signal": "hot|warm|cold",
  "decision_maker_present": true|false,
  "language": "en|es|...",
  "summary": "one sentence, max 140 chars",

  "callback": {
    "requested": true|false,
    "absolute_iso": "YYYY-MM-DDTHH:MM:SS-07:00 or null",
    "relative_phrase": "in 3 months / next tuesday after 5 / null",
    "window_start_iso": "...",
    "window_end_iso": "...",
    "reason": "string or null",
    "decision_maker": "wife|husband|manager|null",
    "confidence": 0.0
  },

  "questions": [
    { "question": "do you sell this for metal roofs?", "category": "pricing|warranty|install|financing|legal|trust|other" }
  ],
  "objections": [
    { "text": "too expensive right now", "category": "price|timing|trust|need|authority|competitor" }
  ],
  "facts": [
    { "key": "roof_age",  "value": "12 years",  "confidence": 0.9 },
    { "key": "kids",      "value": "3",         "confidence": 0.8 },
    { "key": "pet",       "value": "big dog",   "confidence": 0.7 },
    { "key": "competitor","value": "ADT",       "confidence": 0.8 }
  ]
}

Rules:
- Resolve relative dates against the provided "now" timestamp.
- "come back in 3 months" → absolute_iso = now + 3 months at 17:00 local.
- "after taxes" → window_start = April 16 of the next April.
- If no callback requested, callback.requested = false and other fields null.
- Never invent facts not present in the transcript.
- Output JSON only.`;

Deno.serve(async (req) => {
  const { transcript, knock_id, door_id, now, tz } = await req.json();
  if (!transcript) return new Response("transcript required", { status: 400 });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull prior memory so the model can disambiguate "come back" vs "come back AGAIN".
  let memory: any = null;
  if (door_id) {
    const { data } = await supa.from("door_memory").select("*").eq("door_id", door_id).maybeSingle();
    memory = data;
  }

  const userMsg = JSON.stringify({
    now: now ?? new Date().toISOString(),
    tz: tz ?? "America/Denver",
    door_memory: memory,
    transcript,
  });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "{}";
  let intent: any;
  try { intent = JSON.parse(text); }
  catch { return new Response("model returned non-JSON", { status: 502 }); }

  // Fan-out writes — only if we have a knock_id + door_id to attach to.
  if (knock_id && door_id) {
    const { data: knock } = await supa.from("knocks").select("org_id").eq("id", knock_id).single();
    const org_id = knock?.org_id;
    if (org_id) {
      await supa.from("knocks").update({
        status: intent.outcome,
        sentiment: intent.sentiment,
        buying_signal: intent.buying_signal,
        decision_maker_present: intent.decision_maker_present,
        language: intent.language,
        summary: intent.summary,
      }).eq("id", knock_id);

      if (intent.callback?.requested) {
        await supa.from("door_callbacks").insert({
          org_id, door_id, knock_id,
          callback_at: intent.callback.absolute_iso,
          relative_phrase: intent.callback.relative_phrase,
          window_start: intent.callback.window_start_iso,
          window_end: intent.callback.window_end_iso,
          reason: intent.callback.reason,
          decision_maker: intent.callback.decision_maker,
          confidence: intent.callback.confidence,
        });
      }

      if (Array.isArray(intent.questions) && intent.questions.length) {
        await supa.from("door_questions").insert(
          intent.questions.map((q: any) => ({
            org_id, door_id, knock_id, question: q.question, category: q.category,
          })),
        );
      }
      if (Array.isArray(intent.objections) && intent.objections.length) {
        await supa.from("door_objections").insert(
          intent.objections.map((o: any) => ({
            org_id, door_id, knock_id, text: o.text, category: o.category,
          })),
        );
      }
      if (Array.isArray(intent.facts) && intent.facts.length) {
        await supa.from("door_facts").insert(
          intent.facts.map((f: any) => ({
            org_id, door_id, knock_id, key: f.key, value: f.value, confidence: f.confidence,
          })),
        );
      }
    }
  }

  return new Response(JSON.stringify(intent), {
    headers: { "content-type": "application/json" },
  });
});
