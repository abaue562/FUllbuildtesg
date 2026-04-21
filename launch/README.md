# Distribution Engine — auto-generated launch playbook

`just launch <product-slug>` produces:

## 1. Landing page (Astro 5)
- Hero, social proof, feature grid, pricing, FAQ, footer
- OG image, sitemap, robots.txt
- Programmatic SEO `/[city]/[use-case]` pages from a CSV
- Lighthouse 100 baseline

## 2. Product Hunt kit (`launch/ph/`)
- `tagline.txt` (60 chars)
- `description.md` (260 chars)
- `gallery/` 5 images @ 1270×760
- `first-comment.md` (founder story)
- `hunter-outreach.md` (5 hunter DM templates)
- `launch-day-checklist.md`

## 3. Hacker News Show HN
- `hn-title.txt` (`Show HN: <product> – <one line>`)
- `hn-body.md` — what/why/stack/ask
- Best post time: Tuesday 8am PT

## 4. Cold outbound (free stack)
- Common Crawl + Hunter.io free tier + Apollo free tier
- Script: `outbound/build-list.py` → ICP filter → CSV
- Sequence: `outbound/sequence.md` (4 emails over 12 days)
- Sender: Resend or Plunk via Inngest

## 5. Content calendar (Postiz)
- 30 posts: 10 educational, 10 product, 5 founder, 5 social proof
- Auto-cross-post X/LinkedIn/Threads/Bluesky

## 6. SEO programmatic pages
- `/alternatives/<incumbent>` — comparison tables
- `/integrations/<tool>` — landing per integration
- `/use-cases/<vertical>` — industry pages
- `/blog/<keyword>` — AI-drafted, human-edited

## 7. Reddit + IH playbook
- 5 subreddits to seed (no spam — answer Qs, link in comments)
- Indie Hackers product post template
- Twitter/X build-in-public thread template

## 8. Affiliate / partner kit
- Public API for partners
- Revenue share via Polar.sh
- Embed badge program (see viral/)
