# First-run wizard for Windows. Mirrors wizard.sh.
$ErrorActionPreference = "Stop"
$envFile = "$PSScriptRoot\..\.env"
$example = "$PSScriptRoot\..\.env.example"
if (-not (Test-Path $example)) { throw "Missing .env.example" }

function Gen([int]$n=24) { -join ((1..($n*2)) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }) }
function Ask($q, $def="") { $a = Read-Host "  $q$(if($def){' ['+$def+']'})"; if([string]::IsNullOrEmpty($a)){$def}else{$a} }

Write-Host "── OSS Empire first-run wizard ──"
$SERVER_IP = Ask "Public IP or domain (leave blank for localhost):" "localhost"
$TZ        = Ask "Timezone:" "America/New_York"
$ANTHROPIC = Ask "Anthropic API key (sk-ant-…):"
$OPENAI    = Ask "OpenAI API key (optional, enter to skip):"
$SENDGRID  = Ask "SendGrid API key (optional, enter to skip):"
$ADMIN     = Ask "Admin email:" "admin@$SERVER_IP"

Copy-Item $example $envFile -Force
$content = Get-Content $envFile

function Set-Env($k, $v) {
  $script:content = $script:content -replace "^$k=.*", "$k=$v"
}
Set-Env "SERVER_IP" $SERVER_IP
Set-Env "TIMEZONE" $TZ
Set-Env "ANTHROPIC_API_KEY" $ANTHROPIC
Set-Env "OPENAI_API_KEY" $OPENAI
Set-Env "SMTP_PASS" $SENDGRID
Set-Env "SENDGRID_API_KEY" $SENDGRID
Set-Env "AFFINE_ADMIN_EMAIL" $ADMIN

$auto = @(
  "N8N_PASSWORD","N8N_API_KEY","SUPABASE_DB_PASS","SUPABASE_JWT_SECRET","SUPABASE_ANON_KEY","SUPABASE_SERVICE_KEY",
  "AFFINE_ADMIN_PASSWORD","AFFINE_DB_PASSWORD","COOLIFY_DB_PASSWORD","COOLIFY_REDIS_PASSWORD",
  "CHATWOOT_DB_PASS","CHATWOOT_SECRET","SURFSENSE_DB_PASSWORD","SURFSENSE_SECRET",
  "TWENTY_DB_PASS","TWENTY_ACCESS_SECRET","TWENTY_LOGIN_SECRET","TWENTY_REFRESH_SECRET",
  "METABASE_DB_PASS","MAUTIC_DB_PASS","MAUTIC_DB_ROOT_PASS","POSTIZ_DB_PASS","POSTIZ_JWT_SECRET",
  "NOCODB_JWT","FORMBRICKS_SECRET","FORMBRICKS_ENCRYPT","GROWTHBOOK_JWT","GROWTHBOOK_ENCRYPT",
  "GLITCHTIP_DB_PASS","GLITCHTIP_SECRET","TEMPORAL_DB_PASS","UNLEASH_DB_PASS",
  "WAHA_PASS","SMS_GW_PASS","TEXTBEE_JWT_SECRET","TEXTBEE_NEXTAUTH_SECRET",
  "MINIO_PASSWORD","MEILISEARCH_KEY"
)
foreach ($k in $auto) { Set-Env $k (Gen) }
$content | Set-Content $envFile
Write-Host "✓ .env written. Secrets generated."
