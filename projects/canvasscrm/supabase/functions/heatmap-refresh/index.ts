// Cron edge function — refresh the knock_heatmap_hourly materialized view
// every 5 minutes so the web admin renders fresh density tiles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await supa.rpc("refresh_heatmap");
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
});
