// Rep taps SOLD → app calls this → returns a Stripe payment link → texted to customer.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const { deal_id, amount_cents, product, customer_email, customer_phone } = await req.json();

  // 1) Create or fetch Stripe customer
  let customer;
  if (customer_email) {
    const found = await stripe.customers.list({ email: customer_email, limit: 1 });
    customer = found.data[0] ?? await stripe.customers.create({ email: customer_email, phone: customer_phone });
  }

  // 2) One-off Price + Payment Link (simplest UX, no Checkout config needed)
  const price = await stripe.prices.create({
    unit_amount: amount_cents,
    currency: "usd",
    product_data: { name: product },
  });
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { deal_id },
    after_completion: { type: "hosted_confirmation" },
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({
    url: link.url,
    payment_link_id: link.id,
    customer_id: customer?.id ?? null,
  }), { headers: { "content-type": "application/json" } });
});
