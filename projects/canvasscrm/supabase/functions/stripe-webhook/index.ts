// Stripe → us. Marks deals paid, fires sequences, updates SaaS subs.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let evt: Stripe.Event;
  try {
    evt = await stripe.webhooks.constructEventAsync(body, sig, SECRET);
  } catch (e) {
    return new Response(`bad sig: ${e}`, { status: 400 });
  }

  switch (evt.type) {
    case "checkout.session.completed":
    case "payment_link.completed": {
      const session = evt.data.object as any;
      const dealId = session.metadata?.deal_id;
      if (dealId) {
        await sb.from("deals").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
        }).eq("id", dealId);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = evt.data.object as any;
      await sb.from("subscriptions_org").upsert({
        org_id: sub.metadata?.org_id,
        stripe_customer_id: sub.customer,
        stripe_subscription_id: sub.id,
        plan: sub.metadata?.plan ?? "pro",
        seats: sub.items?.data?.[0]?.quantity ?? 1,
        status: sub.status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });
      break;
    }
    case "invoice.payment_failed": {
      // TODO: notify org admin, pause new feature usage
      break;
    }
  }

  return new Response("ok");
});
