#!/bin/bash
# ============================================================
# OSS STACK SETUP SCRIPT
# Run this once on a fresh Ubuntu 22.04+ VPS or local machine
# Usage: chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  OSS Dev + Research Stack Setup${NC}"
echo -e "${GREEN}============================================${NC}"

# ── 1. Install Docker if not present ─────────────────────────
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo -e "${GREEN}Docker installed. You may need to log out and back in.${NC}"
else
  echo -e "${GREEN}Docker already installed.${NC}"
fi

# ── 2. Install Docker Compose if not present ─────────────────
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}Installing Docker Compose plugin...${NC}"
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin
else
  echo -e "${GREEN}Docker Compose already installed.${NC}"
fi

# ── 3. Set up .env file ───────────────────────────────────────
if [ ! -f .env ]; then
  echo -e "${YELLOW}Creating .env from template...${NC}"
  cp .env.example .env
  # Auto-generate secure passwords
  SURFSENSE_DB_PASSWORD=$(openssl rand -hex 16)
  AFFINE_DB_PASSWORD=$(openssl rand -hex 16)
  COOLIFY_DB_PASSWORD=$(openssl rand -hex 16)
  COOLIFY_REDIS_PASSWORD=$(openssl rand -hex 16)
  SURFSENSE_SECRET=$(openssl rand -hex 32)
  
  sed -i "s/surfsense_\$(openssl rand -hex 16)/$SURFSENSE_DB_PASSWORD/" .env
  sed -i "s/affine_\$(openssl rand -hex 16)/$AFFINE_DB_PASSWORD/" .env
  sed -i "s/coolify_\$(openssl rand -hex 16)/$COOLIFY_DB_PASSWORD/" .env
  sed -i "s/coolify_redis_\$(openssl rand -hex 16)/$COOLIFY_REDIS_PASSWORD/" .env
  sed -i "s/surfsense_secret_\$(openssl rand -hex 32)/$SURFSENSE_SECRET/" .env
  
  echo -e "${RED}IMPORTANT: Edit .env and add your API keys before starting!${NC}"
  echo -e "  nano .env"
  echo ""
else
  echo -e "${GREEN}.env already exists, skipping generation.${NC}"
fi

# ── 4. Create SearxNG config ──────────────────────────────────
mkdir -p searxng-config
if [ ! -f searxng-config/settings.yml ]; then
cat > searxng-config/settings.yml << 'SEARXNG_CONFIG'
use_default_settings: true
server:
  secret_key: "$(openssl rand -hex 32)"
  bind_address: "0.0.0.0:8080"
search:
  safe_search: 0
  default_lang: "en"
ui:
  default_theme: simple
engines:
  - name: google
    engine: google
    shortcut: g
  - name: bing
    engine: bing
    shortcut: b
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg
SEARXNG_CONFIG
  echo -e "${GREEN}SearxNG config created.${NC}"
fi

# ── 5. Install Coolify (Vercel replacement) ───────────────────
echo ""
echo -e "${YELLOW}Installing Coolify (Vercel replacement)...${NC}"
echo -e "${YELLOW}This runs on port 8000. Your apps deploy from here.${NC}"
if ! command -v coolify &> /dev/null; then
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  echo -e "${GREEN}Coolify installed! Access at http://$(hostname -I | awk '{print $1}'):8000${NC}"
else
  echo -e "${GREEN}Coolify already installed.${NC}"
fi

# ── 6. Pull and start all services ───────────────────────────
echo ""
echo -e "${YELLOW}Pulling Docker images (this takes a few minutes)...${NC}"
docker compose pull

echo ""
echo -e "${YELLOW}Starting all services...${NC}"
docker compose up -d

# ── 7. Wait for services to be healthy ───────────────────────
echo ""
echo -e "${YELLOW}Waiting for services to start (30s)...${NC}"
sleep 30

# ── 8. Print access URLs ──────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  STACK IS RUNNING — ACCESS URLS${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  🔍 Perplexica (search)     http://${SERVER_IP}:3001"
echo -e "  📓 SurfSense (NotebookLM)  http://${SERVER_IP}:3002"
echo -e "  📚 AnythingLLM (doc Q&A)   http://${SERVER_IP}:3003"
echo -e "  📋 AFFiNE (Notion)         http://${SERVER_IP}:3004"
echo -e "  🔗 n8n (automation)        http://${SERVER_IP}:5678"
echo -e "  ▲  Coolify (deploy)        http://${SERVER_IP}:8000"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Add your API keys to .env if you haven't already"
echo -e "  2. Restart after editing .env: docker compose restart"
echo -e "  3. Set up Coolify for deploying your apps"
echo -e "  4. Connect SurfSense to your tools (GitHub, Notion, Slack)"
echo -e "  5. (Optional) Install Ollama for fully local AI:"
echo -e "     curl -fsSL https://ollama.ai/install.sh | sh"
echo -e "     ollama pull llama3.2"
echo ""
