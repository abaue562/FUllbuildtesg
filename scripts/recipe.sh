#!/usr/bin/env bash
# Recipe runner. `just new <recipe> <name>` ends up here.
set -euo pipefail

RECIPE="${1:-}"
NAME="${2:-}"
[[ -z "$RECIPE" || -z "$NAME" ]] && { echo "usage: just new <recipe> <name>"; echo "recipes: saas directory crm game app site podcast"; exit 1; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/projects/$NAME"
mkdir -p "$DEST"

case "$RECIPE" in
  saas)      TEMPLATE="next-saas-stripe-supabase" ;;
  directory) TEMPLATE="next-directory-seo" ;;
  crm)       TEMPLATE="expo-crm-jobber" ;;
  game)      TEMPLATE="godot-mobile-arcade" ;;
  app)       TEMPLATE="expo-production-app" ;;
  site)      TEMPLATE="astro-marketing" ;;
  podcast)   TEMPLATE="n8n-podcast-pipeline" ;;
  *) echo "unknown recipe: $RECIPE"; exit 1 ;;
esac

echo "▸ Scaffolding $RECIPE → $DEST (template: $TEMPLATE)"
# In a real install this would degit a template repo. For now we drop a CLAUDE-compatible README
# so the AI brain knows exactly what to build next.
cat > "$DEST/CLAUDE-TASK.md" <<EOF
# New project: $NAME ($RECIPE)

Read \`master/claude-code/CLAUDE.md\` first. Then build this project according to the
**${RECIPE^^}** recipe in \`recipes/${RECIPE}.md\`. Wire it to the local stack using the
ports in \`master/.env\`. Stop when the recipe's "Definition of done" is satisfied.
EOF

echo "✓ Created $DEST/CLAUDE-TASK.md"
echo "▸ Next: cd $DEST && claude  (the brain takes over from here)"
