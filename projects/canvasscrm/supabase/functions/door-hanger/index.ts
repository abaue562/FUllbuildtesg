// DOOR HANGER GENERATOR
// When a rep hits a no-answer door, this fires automatically and:
//   1. Creates a door_hangers row with a unique QR code
//   2. Returns a PDF-ready door hanger layout (A5 size, printable)
//      OR generates a digital card the rep can text to the customer
//   3. The QR code links to a landing page: canvass.app/visit/{token}
//      that shows: rep photo, company, product, book appointment CTA
//   4. When the customer scans it, door_hangers.scanned_at is set
//      and the lead is auto-enrolled in the "interested_nurture" sequence

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const { org_id, door_id, knock_id, rep_id } = await req.json();

  // Generate unique token
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const landing_url = `https://canvass.app/visit/${token}`;
  const qr_code = token;

  // Pull rep card info
  const { data: repCard } = await supa
    .from("rep_cards")
    .select("slug, headline, photo_path, booking_url, avg_rating, review_count")
    .eq("user_id", rep_id)
    .maybeSingle();

  // Pull door address
  const { data: door } = await supa
    .from("doors")
    .select("addresses(line1, city, state)")
    .eq("id", door_id)
    .maybeSingle();

  // Create hanger record
  const { data: hanger } = await supa
    .from("door_hangers")
    .insert({ org_id, door_id, knock_id, rep_id, qr_code, landing_url })
    .select("id")
    .single();

  // Auto-enroll in nurture sequence when scanned (handled by webhook on update)
  // Return the hanger data for the mobile app to show a confirmation card
  return new Response(JSON.stringify({
    hanger_id: hanger?.id,
    landing_url,
    qr_code,
    rep_card: repCard,
    address: door?.addresses,
    // SVG QR data would be generated client-side via react-native-qrcode-svg
  }), { headers: { "content-type": "application/json" } });
});
