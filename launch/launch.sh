#!/usr/bin/env bash
# just launch <slug>
set -euo pipefail
SLUG="${1:?usage: launch.sh <slug>}"
ROOT="$(dirname "$0")/../../projects/$SLUG/launch"
mkdir -p "$ROOT"/{ph/gallery,hn,outbound,content,seo,reddit}

cat > "$ROOT/CLAUDE-LAUNCH-TASK.md" <<EOF
# Launch task for: $SLUG

Read project README, then generate ALL of:
- ph/tagline.txt, ph/description.md, ph/first-comment.md, ph/hunter-outreach.md, ph/launch-day-checklist.md
- hn/hn-title.txt, hn/hn-body.md
- outbound/icp.md, outbound/sequence.md (4 emails)
- content/calendar.md (30 posts: 10 edu, 10 product, 5 founder, 5 social proof)
- seo/alternatives.md (vs top 3 incumbents), seo/integrations.md, seo/use-cases.md
- reddit/subreddits.md, reddit/posts.md

Constraints: real claims only, no hype words, founder voice, 100% truthful.
EOF
echo "✓ Launch scaffold ready at $ROOT"
echo "  Run: claude code, then point at $ROOT/CLAUDE-LAUNCH-TASK.md"
