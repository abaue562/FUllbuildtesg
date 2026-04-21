// SEQUENCE-DISPATCH — Cron-driven automation runner.
//
// Runs every 5 minutes (set in Supabase dashboard → Edge Functions → Schedule).
//
// Finds all sequence_enrollments where:
//   - next_send_at <= now()
//   - status = 'active'
//   - current_step < total steps
//
// For each enrollment:
//   1. Load the next sequence_step
//   2. Resolve the contact's email/phone from the enrollment's contact_id
//   3. Render the template (variable substitution)
//   4. Call send-message edge function
//   5. Insert a row into messages (audit log)
//   6. Advance current_step and set next_send_at = now() + delay_days
//   7. If last step, set status = 'completed'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const now = new Date().toISOString();

  // Fetch due enrollments with full context
  const { data: enrollments, error } = await supabase
    .from("sequence_enrollments")
    .select(`
      id, contact_id, current_step, status, metadata,
      sequence:sequences(
        id, name,
        steps:sequence_steps(
          step_number, channel, subject_template, body_template, delay_days
        )
      ),
      contact:customers(
        id, email, phone, first_name, last_name, company
      )
    `)
    .eq("status", "active")
    .lte("next_send_at", now)
    .order("next_send_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("enrollment fetch error:", error);
    return new Response("error", { status: 500 });
  }

  let sent = 0;
  let errors = 0;

  for (const enrollment of enrollments ?? []) {
    try {
      const steps = (enrollment.sequence?.steps ?? []).sort(
        (a: any, b: any) => a.step_number - b.step_number
      );
      const step = steps[enrollment.current_step];
      if (!step) {
        // Past last step — mark complete
        await supabase
          .from("sequence_enrollments")
          .update({ status: "completed" })
          .eq("id", enrollment.id);
        continue;
      }

      const contact = enrollment.contact;
      if (!contact) continue;

      // Render templates
      const vars: Record<string, string> = {
        first_name: contact.first_name ?? "there",
        last_name: contact.last_name ?? "",
        full_name: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
        company: contact.company ?? "",
        ...(enrollment.metadata ?? {}),
      };

      const render = (tmpl: string) =>
        tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

      const subject = render(step.subject_template ?? "");
      const body = render(step.body_template ?? "");

      // Determine recipient
      const to =
        step.channel === "sms"
          ? contact.phone
          : contact.email;

      if (!to) {
        console.warn(`enrollment ${enrollment.id}: no ${step.channel} address for contact ${contact.id}`);
        continue;
      }

      // Send via send-message function
      const sendRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ to, channel: step.channel, subject, body }),
        }
      );

      // Audit log
      await supabase.from("messages").insert({
        org_id: contact.org_id,
        contact_id: contact.id,
        channel: step.channel,
        direction: "outbound",
        subject,
        body,
        status: sendRes.ok ? "sent" : "failed",
        sequence_enrollment_id: enrollment.id,
        sequence_step: enrollment.current_step,
      });

      // Advance step
      const nextStep = enrollment.current_step + 1;
      const isLast = nextStep >= steps.length;
      const nextDelay = steps[nextStep]?.delay_days ?? 0;
      const nextSendAt = new Date(Date.now() + nextDelay * 86400000).toISOString();

      await supabase
        .from("sequence_enrollments")
        .update({
          current_step: nextStep,
          next_send_at: isLast ? null : nextSendAt,
          status: isLast ? "completed" : "active",
          last_sent_at: now,
        })
        .eq("id", enrollment.id);

      sendRes.ok ? sent++ : errors++;
    } catch (err) {
      console.error(`enrollment ${enrollment.id} failed:`, err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ processed: (enrollments ?? []).length, sent, errors }),
    { headers: { "content-type": "application/json" } }
  );
});
