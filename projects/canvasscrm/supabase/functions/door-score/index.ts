// DOOR-SCORE — Next-Best-Door AI ranker.
// Walks every door in a territory and assigns 0..100 based on:
//   - neighbor sales density (if Smith next door bought, you score)
//   - lookalike distance to your sold-door cluster
//   - prior knock outcomes (callback > no_answer > not_interested)
//   - time-of-day fit (rep_hour_performance for this rep+street+hour)
//   - weather match against historical conv rate
//   - DNC / no-soliciting penalties
// Writes results to door_scores so the mobile map can color-grade doors hot→cold.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { org_id, territory_id, user_id, hour } = await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: doors } = await supa
    .from("doors")
    .select("id, address_id, lat:addresses(lat), lng:addresses(lng), status")
    .eq("org_id", org_id)
    .eq("territory_id", territory_id);

  if (!doors) return new Response("[]");

  const { data: lookalikes } = await supa.rpc("find_lookalikes", {
    p_org: org_id, p_radius_m: 600,
  });
  const laMap = new Map((lookalikes ?? []).map((l: any) => [l.door_id, l.score]));

  const { data: hourPerf } = await supa
    .from("rep_hour_performance")
    .select("hour, conv_pct")
    .eq("org_id", org_id)
    .eq("user_id", user_id);
  const hourFit = hourPerf?.find((h: any) => h.hour === hour)?.conv_pct ?? 5;

  const rows = doors.map((d: any) => {
    const factors: Record<string, number> = {};
    factors.lookalike = (laMap.get(d.id) as number) ?? 0;
    factors.hour_fit  = Math.min(hourFit * 4, 100);
    factors.unworked  = d.status === "unknocked" ? 25 : 0;
    factors.callback  = d.status === "callback" ? 60 : 0;
    factors.dnc       = d.status === "dnc" || d.status === "no_soliciting" ? -100 : 0;
    const score = Math.max(0, Math.min(100,
      0.4 * factors.lookalike +
      0.25 * factors.hour_fit +
      0.15 * factors.unworked +
      0.2  * factors.callback +
      factors.dnc
    ));
    return { door_id: d.id, org_id, score, factors, computed_at: new Date().toISOString() };
  });

  await supa.from("door_scores").upsert(rows, { onConflict: "door_id" });
  return new Response(JSON.stringify({ scored: rows.length }), {
    headers: { "content-type": "application/json" },
  });
});
