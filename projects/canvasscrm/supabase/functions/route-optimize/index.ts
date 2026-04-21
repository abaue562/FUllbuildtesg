// ROUTE-OPTIMIZE — greedy nearest-neighbor TSP over the top-N highest scored
// doors in a territory. Returns an ordered list of door_ids the rep should
// hit, optionally constrained by a time budget (minutes).
//
// Good enough for canvassing: 50–200 doors, sub-second, no external API.
// Drop-in replacement: swap the inner loop for OR-Tools later if needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Door = { id: string; lat: number; lng: number; score: number };

function dist(a: Door, b: Door) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

Deno.serve(async (req) => {
  const { org_id, territory_id, start_lat, start_lng, max_doors = 80, minutes_budget = 240 } =
    await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data } = await supa
    .from("doors")
    .select("id, addresses(lat,lng), door_scores(score)")
    .eq("org_id", org_id)
    .eq("territory_id", territory_id)
    .order("door_scores(score)", { ascending: false })
    .limit(max_doors);

  const doors: Door[] = (data ?? []).map((d: any) => ({
    id: d.id,
    lat: d.addresses?.lat,
    lng: d.addresses?.lng,
    score: d.door_scores?.[0]?.score ?? 0,
  })).filter((d) => d.lat && d.lng);

  // Greedy nearest neighbor with score boost: each step picks the door with
  // the best (1 / distance) * (score + 1) tradeoff.
  const route: Door[] = [];
  const remaining = [...doors];
  let cur: Door = { id: "start", lat: start_lat, lng: start_lng, score: 0 };
  let walkedM = 0;
  const walkSpeed = 1.2; // m/s
  const knockTime = 90;  // seconds avg per door

  while (remaining.length) {
    let bestIdx = -1;
    let bestUtil = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(cur, remaining[i]);
      const util = (remaining[i].score + 5) / (d + 50);
      if (util > bestUtil) { bestUtil = util; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    const stepM = dist(cur, next);
    const projMin = (walkedM + stepM) / walkSpeed / 60 + (route.length + 1) * (knockTime / 60);
    if (projMin > minutes_budget) break;
    walkedM += stepM;
    route.push(next);
    cur = next;
  }

  return new Response(JSON.stringify({
    route: route.map((d) => d.id),
    total_doors: route.length,
    distance_m: Math.round(walkedM),
    est_minutes: Math.round(walkedM / walkSpeed / 60 + route.length * (knockTime / 60)),
  }), { headers: { "content-type": "application/json" } });
});
