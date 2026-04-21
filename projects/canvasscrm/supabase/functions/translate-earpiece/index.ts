// TRANSLATE EARPIECE — real-time language translation for the rep.
// When intent-extract detects language != "en", this function fires.
// Returns:
//   1. The customer's words translated to English (rep understands them)
//   2. The rep's suggested response translated INTO the customer's language
//      (rep can read it aloud or show the phone screen)
//
// Supports any language Claude knows. Optimized for Spanish (most common).

const MODEL = "claude-haiku-4-5-20251001";

Deno.serve(async (req) => {
  const { transcript, detected_language, suggested_line, product } = await req.json();

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: `You are a real-time field translation assistant for door-to-door sales.
Output STRICT JSON only:
{
  "customer_said_english": "translation of what customer said",
  "rep_response_translated": "the suggested rep line translated into the customer's language",
  "phonetic": "phonetic spelling so English-speaking rep can pronounce it",
  "key_phrase": "the single most important 3-5 word phrase the rep should say",
  "key_phrase_phonetic": "phonetic of key_phrase"
}`,
      messages: [{
        role: "user",
        content: JSON.stringify({
          customer_transcript: transcript,
          customer_language: detected_language,
          suggested_english_line: suggested_line,
          product,
        }),
      }],
    }),
  });

  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "{}";
  return new Response(text, { headers: { "content-type": "application/json" } });
});
