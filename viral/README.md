# Viral Layer — what makes apps spread

Every product wires these by default. Each module is ~1 file.

## 1. Referral engine (Postgres-only, no SaaS)
```sql
create table referrals (
  code text primary key,
  inviter_id uuid not null,
  invitee_id uuid,
  reward_status text default 'pending',  -- pending|granted
  created_at timestamptz default now(),
  converted_at timestamptz
);
```
- Every user gets `code = base62(user.id)` on signup.
- Share URL: `https://app.com/?r=CODE`.
- On signup, if `?r=` cookie present → insert + grant both sides a credit.
- Leaderboard at `/leaderboard` for gamification.

## 2. Public share links + OG image
- Route: `/s/[token]` → server-renders a public read-only view.
- OG image via `@vercel/og` — dynamic per-share. This is the #1 driver of inbound on social.

## 3. Embeddable widget (Trojan horse)
```html
<script src="https://app.com/embed.js" data-id="abc123"></script>
```
Customers paste it on their site → your brand seeds the web. Loom, Calendly, Typeform all grew this way.

## 4. Waitlist + invite tree
- `/waitlist` → email + position
- Position improves when friends join via your link
- Top 100 get early access. Robinhood-grade FOMO.

## 5. "Built with" badge
Free tier requires `<a href="https://oss-empire.com">Built with Empire</a>` in footer. Paid tier removes it. Notion/Linear/Cal.com all do this.

## 6. Lifecycle email (Plunk or Resend + Inngest)
- Day 0: welcome + activation steps
- Day 1: feature highlight
- Day 3: case study
- Day 7: upgrade nudge
- Day 14: win-back if inactive
- Day 30: referral push

## 7. Public changelog + RSS
`/changelog` is one of the highest-converting SEO pages. Every shipped feature → markdown file → auto-tweets via Postiz.

## 8. Programmatic SEO
`pages/[city]/[service].astro` generates 10,000 pages from a CSV. Captures long-tail intent. Astro + sitemap → Google indexes the lot.

## 9. Public benchmarks page
"How [your tool] compares to Salesforce/HubSpot/etc." Side-by-side feature table. Ranks for "[incumbent] alternative" forever.
