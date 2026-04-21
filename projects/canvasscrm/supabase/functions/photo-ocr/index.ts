// PHOTO OCR — Claude vision reads a door/yard photo and extracts:
//   - House number (so GPS-identified doors can be auto-confirmed)
//   - Yard signs (ADT, Ring, solar company, political, DNC)
//   - Competitor equipment visible (satellite dish brand, alarm panel brand)
//   - Property condition signals (new roof, old windows, solar panels)
//   - Language signals (non-English signage → spanish_only flag)
//   - Dog warning signs → safety flag
//
// Called immediately after the rep snaps a photo in the door detail modal.
// Writes to knock_photos.ai_caption, door_facts, competitor_sightings,
// and updates door.status if DNC / no_soliciting sign detected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";

Deno.serve(async (req) => {
  const { photo_path, knock_id, door_id, org_id } = await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get a signed URL for the image
  const { data: signed } = await supa.storage
    .from("recordings")
    .createSignedUrl(photo_path, 120);
  if (!signed?.signedUrl) return new Response("photo not found", { status: 404 });

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
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: signed.signedUrl },
          },
          {
            type: "text",
            text: `Analyze this door/yard photo for a canvassing sales CRM.
Output STRICT JSON only:
{
  "house_number": "123 or null",
  "caption": "one sentence description",
  "dnc_sign": true|false,
  "no_soliciting": true|false,
  "dog_warning": true|false,
  "language": "en|es|other|null",
  "competitors": ["ADT","Ring","Vivint",...],
  "property_signals": [
    {"key":"solar_panels","value":"present","confidence":0.9},
    {"key":"roof_condition","value":"new","confidence":0.7},
    {"key":"windows","value":"old single-pane","confidence":0.6}
  ],
  "yard_signs": ["political","solar","realtor",...]
}`,
          },
        ],
      }],
    }),
  });

  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "{}";
  let ocr: any;
  try { ocr = JSON.parse(text); } catch { return new Response("ocr failed", { status: 502 }); }

  // Write caption back to knock_photos
  await supa.from("knock_photos")
    .update({ ai_caption: ocr.caption })
    .eq("storage_path", photo_path);

  // Auto-flag DNC / no-soliciting
  if (ocr.dnc_sign || ocr.no_soliciting) {
    await supa.from("doors").update({
      status: ocr.dnc_sign ? "dnc" : "no_soliciting",
    }).eq("id", door_id);
  }

  // Dog warning → safety fact
  if (ocr.dog_warning) {
    await supa.from("door_facts").insert({
      org_id, door_id, knock_id,
      key: "dog_warning", value: "sign visible", confidence: 0.95,
    });
  }

  // Language signal
  if (ocr.language && ocr.language !== "en") {
    await supa.from("doors").update({ status: "spanish_only" }).eq("id", door_id);
  }

  // Competitor sightings
  for (const comp of (ocr.competitors ?? [])) {
    await supa.from("competitor_sightings").insert({
      org_id, door_id,
      competitor: comp,
      evidence: "photo",
      photo_path,
    });
  }

  // Property signals → door_facts
  if (Array.isArray(ocr.property_signals) && ocr.property_signals.length) {
    await supa.from("door_facts").insert(
      ocr.property_signals.map((s: any) => ({
        org_id, door_id, knock_id,
        key: s.key, value: s.value, confidence: s.confidence,
      })),
    );
  }

  return new Response(JSON.stringify(ocr), { headers: { "content-type": "application/json" } });
});
