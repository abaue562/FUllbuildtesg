// TRANSCRIBE — cloud fallback for when on-device whisper.cpp is unavailable.
// Receives audio blob, calls OpenAI Whisper API (or self-hosted faster-whisper),
// returns plain text transcript.
// Only used when the phone can't run whisper.cpp locally (older devices).

Deno.serve(async (req) => {
  const form = await req.formData();
  const audio = form.get("audio") as File | null;
  if (!audio) return new Response("no audio", { status: 400 });

  const wForm = new FormData();
  wForm.append("file", audio, "audio.m4a");
  wForm.append("model", "whisper-1");
  wForm.append("language", "en");
  wForm.append("response_format", "verbose_json"); // includes word timestamps

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
    body: wForm,
  });

  const j = await r.json();
  return new Response(JSON.stringify({ text: j?.text ?? "" }), {
    headers: { "content-type": "application/json" },
  });
});
