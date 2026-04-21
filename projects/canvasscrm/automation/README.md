# CanvassCRM — Automation layer (Stripe + Email + SMS + Upsells)

Two flows:

## A) **Customer billing** (the homeowner pays)
Stripe powers payment links generated at the door. Rep taps "SOLD" → app generates a Stripe Payment Link or Checkout session for the deal amount → texts it to the customer → on `checkout.session.completed` webhook, the `sales` row flips to `paid`, commission is calculated, customer enters the post-sale sequence.

## B) **Subscription billing** (the org pays you)
Stripe Billing for the SaaS itself. Per-rep seat pricing + usage metering on recordings/minutes. BoxyHQ Jackson handles SSO, Stripe handles money.

---

## Schema additions (`002_billing_and_sequences.sql`)
- `customers` — phone, email, consent flags, source door_id
- `deals` — amount, product, stripe_payment_link, status (quoted|sent|paid|cancelled|refunded)
- `subscriptions_org` — stripe_customer_id, stripe_subscription_id, plan, seats
- `messages` — channel (email|sms), template, status, sent_at, opened_at, clicked_at, replied_at
- `sequences` — id, name, trigger (door_outcome|deal_status|days_since_X)
- `sequence_steps` — sequence_id, day_offset, channel, template, condition
- `sequence_enrollments` — customer_id, sequence_id, current_step, next_run_at, status

---

## The default sequences (auto-enrolled, fully editable)

### 1. "Come back" callback follow-up
Trigger: `door.outcome = callback` with `follow_up_at`
- T-24h before callback time: SMS to rep "Tomorrow 6pm — 1234 Maple St — owner Linda — wanted price in writing"
- T-2h before: Push to rep with map pin
- T+2h after if no knock logged: SMS to rep "Did you make it to Linda's?"
- T+24h: If still no knock, email manager

### 2. Interested-but-not-sold nurture
Trigger: `door.outcome = interested`
- Day 0 (5 min after): SMS to customer "Hey {first_name}, this is {rep_name} from {org}. Here's the info I promised: {link}"
- Day 1: Email "Quick recap of what we discussed" + photos + financing options
- Day 3: SMS "Any questions? Happy to swing back by"
- Day 7: Email upsell "Most neighbors add {addon} — here's why"
- Day 14: SMS "Last check-in — still interested?"
- Day 30: Drop into long-term newsletter

### 3. Sold → onboarding + upsell
Trigger: `deal.status = paid`
- Day 0: SMS "🎉 Welcome aboard {first_name}. Install scheduled for {date}. Reply HELP anytime."
- Day 0: Email receipt + Stripe invoice + photos of paperwork
- Day 1: Email "What to expect on install day"
- Day 7: SMS "How's everything going? ⭐⭐⭐⭐⭐ review here: {link}"
- Day 14: **Upsell email** — "Other {city} customers added {addon}. {discount}% off this week."
- Day 30: SMS "Refer a neighbor → both get $100"  ← REFERRAL FLYWHEEL
- Day 90: Email "Annual maintenance plan?"  ← RECURRING REVENUE
- Day 365: Email "1-year anniversary, here's a thank-you gift + warranty refresher"

### 4. Not-home → retry
Trigger: `door.outcome = not_home`
- 3 days later: Reassign to same rep at different time-of-day
- 7 days later: Reassign to another rep
- 14 days later: Drop from queue

### 5. Pass → win-back (90 days)
Trigger: `door.outcome = not_interested`
- Day 90: Email "Things have changed — here's what's new" (only if customer email captured)

---

## Tech (real OSS + Stripe)
| Need | Tool | License |
|---|---|---|
| Card payments + payment links + subs | **Stripe** | API |
| Email send | **Plunk** (self-host) or **Resend** | Apache-2.0 / API |
| SMS send | **TextBee** primary, **Twilio** fallback | MIT / API |
| Sequence engine | **Inngest** (cron + steps + retries) | Apache-2.0 |
| Templates | **MJML** for email, plain text for SMS | MIT |
| Customer journey UI (admin) | **Next 15 + shadcn flow builder** | MIT |
| Compliance | **DNC list check** + STOP keyword handler | — |

## Edge functions
- `stripe-create-payment-link` — rep app calls when tapping SOLD
- `stripe-webhook` — receives `checkout.session.completed`, `invoice.paid`, `customer.subscription.*`
- `enroll-sequence` — fired by DB trigger on door/deal status change
- `sequence-tick` — Inngest cron, every 5 min, executes due steps
- `send-email` / `send-sms` — channel adapters

## Upsell intelligence (Claude Haiku)
After every sale, edge fn `suggest-upsell` runs:
- Reads the conversation transcript + intent + sale type
- Looks at neighbors' purchase history (same street/postal)
- Returns top 3 upsell offers ranked by likelihood
- Manager sees these on the dashboard, can one-click trigger an upsell sequence

## Stripe + Anthropic guardrails
- Stripe keys live in **Infisical** (enterprise stack) or env vars
- Customer never sees Stripe Connect on-platform — payment link goes direct to Stripe
- Webhook signature verified before any DB write
- Refunds require manager role + audit_log entry
- All outbound SMS includes "Reply STOP" — handled by webhook → marks `customers.sms_consent=false`
- Email unsubscribe link in every send → `customers.email_consent=false`

## What this unlocks for your sales pitch
- "Reps tap SOLD, customer gets a Stripe link, deal closes before rep leaves the porch"
- "Every callback is auto-tracked and the rep gets reminded — no leads slip through"
- "AI suggests upsells from real conversation transcripts, not guesses"
- "Built-in referral flywheel — your sold customers become your next leads"
