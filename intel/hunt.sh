#!/usr/bin/env bash
# just hunt — pulls live signal from real sources, ranks opportunities.
# Outputs: master/intel/daily-report.md
set -euo pipefail
OUT="$(dirname "$0")/daily-report.md"
DATE=$(date +%Y-%m-%d)

echo "# OSS Empire — Opportunity Hunt $DATE" > "$OUT"
echo "" >> "$OUT"

# 1. GitHub Trending (no auth needed)
echo "## GitHub Trending (last 24h)" >> "$OUT"
curl -s "https://api.github.com/search/repositories?q=created:>$(date -d '7 days ago' +%Y-%m-%d)&sort=stars&order=desc&per_page=15" \
  | jq -r '.items[] | "- **\(.full_name)** ⭐\(.stargazers_count) — \(.description // "no desc") — `\(.license.spdx_id // "?")`"' >> "$OUT" || true
echo "" >> "$OUT"

# 2. Hacker News top via Algolia
echo "## Hacker News — top \"Show HN\" this week" >> "$OUT"
curl -s "https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i>$(date -d '7 days ago' +%s)&hitsPerPage=15" \
  | jq -r '.hits[] | "- [\(.title)](\(.url // "https://news.ycombinator.com/item?id=\(.objectID)")) — \(.points) pts, \(.num_comments) comments"' >> "$OUT" || true
echo "" >> "$OUT"

# 3. Reddit r/SaaS pain points
echo "## r/SaaS — top this week" >> "$OUT"
curl -s -A "oss-empire/1.0" "https://www.reddit.com/r/SaaS/top.json?t=week&limit=15" \
  | jq -r '.data.children[].data | "- [\(.title)](https://reddit.com\(.permalink)) — \(.score) up, \(.num_comments) comments"' >> "$OUT" || true
echo "" >> "$OUT"

# 4. ProductHunt (no key needed for public)
echo "## Product Hunt — featured today" >> "$OUT"
curl -s "https://www.producthunt.com/frontend/graphql" -H "content-type: application/json" \
  -d '{"query":"{posts(first:10,order:RANKING){edges{node{name tagline votesCount url}}}}"}' \
  | jq -r '.data.posts.edges[].node | "- **\(.name)** — \(.tagline) (\(.votesCount) votes) \(.url)"' >> "$OUT" 2>/dev/null || echo "- (PH API rate-limited, skipping)" >> "$OUT"
echo "" >> "$OUT"

# 5. Indie Hackers milestones via RSS
echo "## Indie Hackers — recent revenue milestones" >> "$OUT"
curl -s "https://www.indiehackers.com/feed.xml" \
  | grep -oP '(?<=<title>).*?(?=</title>)' | head -15 | sed 's/^/- /' >> "$OUT" || true
echo "" >> "$OUT"

echo "" >> "$OUT"
echo "## Next step" >> "$OUT"
echo "Run \`just build \"<idea from above>\"\` to scaffold using arsenal.yaml + viral + enterprise layers." >> "$OUT"

echo "✓ Wrote $OUT"
