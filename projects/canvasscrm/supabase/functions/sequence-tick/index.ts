// Inngest cron / pg_cron hits this every 5 min.
// Walks active enrollments whose next_run_at <= now() and executes the next step.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async () => {
  const { data: due } = await sb
    .from("sequence_enrollments")
    .select("*, sequences(*), customers(*)")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .limit(200);

  for (const e of due ?? []) {
    const { data: step } = await sb
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", e.sequence_id)
      .eq("step_index", e.current_step)
      .single();

    if (!step) {
      await sb.from("sequence_enrollments").update({ status: "completed" }).eq("id", e.id);
      continue;
    }

    // Render template + send via channel adapter
    if (step.channel === "email") await invoke("send-email", { enrollment: e, step });
    if (step.channel === "sms")   await invoke("send-sms",   { enrollment: e, step });
    if (step.channel === "ai_upsell") await invoke("suggest-upsell", { enrollment: e });

    // Advance
    const nextDelay = step.delay_minutes ?? 0;
    await sb.from("sequence_enrollments").update({
      current_step: e.current_step + 1,
      next_run_at: new Date(Date.now() + nextDelay * 60_000).toISOString(),
    }).eq("id", e.id);
  }
  return new Response("ok");
});

async function invoke(fn: string, body: any) {
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify(body),
  });
}
