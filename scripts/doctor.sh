#!/usr/bin/env bash
# Pre-flight check. Tells the entrepreneur in plain English what's wrong.
set -uo pipefail

PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ! $1"; }

echo "── OSS Empire doctor ──"

command -v docker >/dev/null     && ok "Docker installed"            || bad "Install Docker Desktop"
docker info >/dev/null 2>&1      && ok "Docker is running"           || bad "Start Docker Desktop"
command -v just >/dev/null       && ok "just installed"              || bad "Install just (https://just.systems)"
command -v git >/dev/null        && ok "git installed"               || bad "Install git"

# disk
free_gb=$(df -BG . 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4}')
[[ -n "${free_gb:-}" ]] && [[ $free_gb -gt 20 ]] && ok "Free disk: ${free_gb}G" || warn "Free disk low (need ≥20G)"

# RAM
total_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
[[ $total_mb -gt 7000 ]] && ok "RAM: ${total_mb}MB" || warn "RAM low (recommend ≥8GB)"

# .env
[[ -f master/.env ]] && ok ".env present" || bad "Run 'just secrets' to create .env"

# port collisions
for p in 3001 3002 3004 5678 8080 8000; do
  if (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null; then
    warn "Port $p already in use (something else is listening)"
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "🟢 You're good to go. Run: just up"
else
  echo "🔴 $FAIL problem(s) above. Fix them and re-run 'just doctor'."
fi
