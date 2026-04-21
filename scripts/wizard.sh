#!/usr/bin/env bash
# First-run wizard. 6 questions. Generates every secret. Writes .env.
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
EXAMPLE="$(dirname "$0")/../.env.example"
[[ -f "$EXAMPLE" ]] || { echo "Missing .env.example"; exit 1; }

gen() { openssl rand -hex "${1:-16}"; }
ask() { local q="$1" def="${2:-}" var; read -rp "  $q ${def:+[$def] }" var; echo "${var:-$def}"; }

echo "── OSS Empire first-run wizard ──"
SERVER_IP=$(ask "Public IP or domain (leave blank for localhost):" "localhost")
TZ=$(ask "Timezone:" "$(timedatectl show -p Timezone --value 2>/dev/null || echo America/New_York)")
ANTHROPIC=$(ask "Anthropic API key (sk-ant-…):")
OPENAI=$(ask "OpenAI API key (optional, press enter to skip):")
SMTP_PASS_IN=$(ask "SendGrid API key (optional, press enter to skip):")
ADMIN_EMAIL=$(ask "Admin email:" "admin@${SERVER_IP}")

echo "── generating secrets…"
cp "$EXAMPLE" "$ENV_FILE"

set_env() { local k="$1" v="$2"; sed -i.bak "s|^${k}=.*|${k}=${v}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"; }

set_env SERVER_IP        "$SERVER_IP"
set_env TIMEZONE         "$TZ"
set_env ANTHROPIC_API_KEY "$ANTHROPIC"
set_env OPENAI_API_KEY   "$OPENAI"
set_env SMTP_PASS        "$SMTP_PASS_IN"
set_env SENDGRID_API_KEY "$SMTP_PASS_IN"
set_env AFFINE_ADMIN_EMAIL "$ADMIN_EMAIL"

# auto-generate every empty secret
for KEY in N8N_PASSWORD N8N_API_KEY \
           SUPABASE_DB_PASS SUPABASE_JWT_SECRET SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY \
           AFFINE_ADMIN_PASSWORD AFFINE_DB_PASSWORD \
           COOLIFY_DB_PASSWORD COOLIFY_REDIS_PASSWORD \
           CHATWOOT_DB_PASS CHATWOOT_SECRET \
           SURFSENSE_DB_PASSWORD SURFSENSE_SECRET \
           TWENTY_DB_PASS TWENTY_ACCESS_SECRET TWENTY_LOGIN_SECRET TWENTY_REFRESH_SECRET \
           METABASE_DB_PASS MAUTIC_DB_PASS MAUTIC_DB_ROOT_PASS \
           POSTIZ_DB_PASS POSTIZ_JWT_SECRET NOCODB_JWT \
           FORMBRICKS_SECRET FORMBRICKS_ENCRYPT \
           GROWTHBOOK_JWT GROWTHBOOK_ENCRYPT \
           GLITCHTIP_DB_PASS GLITCHTIP_SECRET \
           TEMPORAL_DB_PASS UNLEASH_DB_PASS \
           WAHA_PASS SMS_GW_PASS TEXTBEE_JWT_SECRET TEXTBEE_NEXTAUTH_SECRET \
           MINIO_PASSWORD MEILISEARCH_KEY; do
  set_env "$KEY" "$(gen 24)"
done

echo "✓ .env written. Secrets generated. Edit by hand any time, or re-run 'just secrets'."
