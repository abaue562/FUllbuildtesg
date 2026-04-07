# ============================================================
# N8N WORKFLOW ENVIRONMENT VARIABLES
# Add these to your n8n instance via Settings → Variables
# Or add them to docker-compose.yml under the n8n service env
# ============================================================

# ── CORE APIs ────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-your-key-here
GITHUB_TOKEN=ghp_your-github-pat-here
GITHUB_REPO=yourusername/your-repo-name

# ── YOUR OSS STACK ───────────────────────────────────────────
PERPLEXICA_URL=http://perplexica-backend:3001
AFFINE_URL=http://affine:3010
AFFINE_WORKSPACE_ID=your-workspace-id-here      # Get from AFFiNE URL after login
AFFINE_TOKEN=your-affine-token-here             # Get from AFFiNE Settings → API
SURFSENSE_URL=http://surfsense:3000
SURFSENSE_TOKEN=your-surfsense-token
SURFSENSE_SPACE_ID=your-space-id

# ── COOLIFY ──────────────────────────────────────────────────
COOLIFY_URL=http://coolify:8000
COOLIFY_API_TOKEN=your-coolify-api-token        # Get from Coolify → Keys & Tokens
COOLIFY_APP_UUID=your-app-uuid                  # Get from Coolify app settings

# ── NOTIFICATIONS ─────────────────────────────────────────────
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK
# To get: Discord server → Edit Channel → Integrations → Webhooks

# ── COMPETITOR RESEARCH (Workflow 06) ──────────────────────────
COMPETITOR_LIST=["CompetitorA","CompetitorB","CompetitorC"]
RESEARCH_TOPICS=["product updates","pricing","new features","funding"]

# ── N8N MCP (for Claude Code to build workflows) ─────────────
N8N_URL=http://localhost:5678
N8N_API_KEY=your-n8n-api-key
# Get from: n8n Settings → n8n API → Create an API key

# ============================================================
# WORKFLOW IMPORT GUIDE
# ============================================================
#
# 1. Open n8n at http://YOUR_IP:5678
# 2. Click + New Workflow
# 3. Click the ··· menu → Import from File
# 4. Import each workflow JSON from n8n-workflows/
# 5. Open each workflow and click the gear icon on nodes
#    to verify env vars are referenced correctly
# 6. Add env vars in n8n: Settings → Variables
# 7. Activate the workflow with the toggle
#
# GITHUB WEBHOOK SETUP (for workflow 02):
# 1. GitHub repo → Settings → Webhooks → Add webhook
# 2. Payload URL: http://YOUR_IP:5678/webhook/github-webhook
# 3. Content type: application/json
# 4. Events: Pull requests
#
# ERROR MONITOR SETUP (for workflow 04):
# Add to your Next.js app's global error handler:
#   // lib/error-reporter.ts
#   export async function reportError(err: Error, context = {}) {
#     await fetch(`${process.env.N8N_URL}/webhook/error-ingest`, {
#       method: 'POST',
#       headers: { 'Content-Type': 'application/json' },
#       body: JSON.stringify({
#         error: err.message,
#         stack: err.stack,
#         context,
#         severity: 'high',
#         app: process.env.NEXT_PUBLIC_APP_NAME
#       })
#     }).catch(() => {}) // never block on monitoring
#   }
#
# CLAUDE CODE SESSION LOG TRIGGER:
# In CLAUDE.md, add this to AUTOMATE: section:
#   When asked to log session, POST to:
#   http://n8n:5678/webhook/session-log
#   Body: { project: "...", notes: "[full session summary]" }
