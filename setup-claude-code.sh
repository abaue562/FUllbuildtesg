#!/bin/bash
# ============================================================
# CLAUDE CODE CLI SETUP
# Installs Claude Code and wires it to your OSS stack
# Usage: chmod +x setup-claude-code.sh && ./setup-claude-code.sh
# Docs: https://code.claude.com/docs/en/overview
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Claude Code CLI Setup${NC}"
echo -e "${GREEN}============================================${NC}"

# ── 1. Check Node.js ──────────────────────────────────────────
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js not found. Installing via nvm...${NC}"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
else
  NODE_VER=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}Node.js $NODE_VER found but 18+ required. Upgrading...${NC}"
    nvm install --lts && nvm use --lts
  else
    echo -e "${GREEN}Node.js $(node --version) found.${NC}"
  fi
fi

# ── 2. Install Claude Code ────────────────────────────────────
echo -e "${YELLOW}Installing Claude Code CLI...${NC}"
npm install -g @anthropic-ai/claude-code
echo -e "${GREEN}Claude Code installed: $(claude --version)${NC}"

# ── 3. Copy config files to project ──────────────────────────
PROJECT_DIR="${1:-.}"
echo -e "${YELLOW}Setting up Claude Code in: $PROJECT_DIR${NC}"

# Copy CLAUDE.md if it doesn't exist
if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  cp claude-code/CLAUDE.md "$PROJECT_DIR/CLAUDE.md"
  echo -e "${GREEN}CLAUDE.md created. Edit it with your project context.${NC}"
else
  echo -e "${YELLOW}CLAUDE.md already exists — skipping (edit manually).${NC}"
fi

# Copy .mcp.json if it doesn't exist
if [ ! -f "$PROJECT_DIR/.mcp.json" ]; then
  cp claude-code/.mcp.json "$PROJECT_DIR/.mcp.json"
  echo -e "${GREEN}.mcp.json created.${NC}"
else
  echo -e "${YELLOW}.mcp.json already exists — skipping.${NC}"
fi

# ── 4. Install MCP server dependencies ───────────────────────
echo -e "${YELLOW}Installing MCP server packages...${NC}"
# Pre-install to speed up first run
npx -y @modelcontextprotocol/server-filesystem --version 2>/dev/null || true
npx -y @modelcontextprotocol/server-fetch --version 2>/dev/null || true
npx -y @modelcontextprotocol/server-memory --version 2>/dev/null || true
echo -e "${GREEN}MCP packages ready.${NC}"

# ── 5. Register MCP servers ───────────────────────────────────
echo -e "${YELLOW}Registering MCP servers with Claude Code...${NC}"

# GitHub (HTTP - no install needed)
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ --scope user 2>/dev/null || true

# Filesystem (project-scoped, reads current dir)
claude mcp add --transport stdio --scope project filesystem -- \
  npx -y @modelcontextprotocol/server-filesystem . 2>/dev/null || true

# Fetch (for web research + Perplexica queries)
claude mcp add --transport stdio --scope user fetch -- \
  npx -y @modelcontextprotocol/server-fetch 2>/dev/null || true

# Memory (persistent cross-session memory)
claude mcp add --transport stdio --scope user memory -- \
  npx -y @modelcontextprotocol/server-memory 2>/dev/null || true

# Git (project-scoped)
claude mcp add --transport stdio --scope project git -- \
  npx -y @cline/mcp-server-git --repository . 2>/dev/null || true

echo -e "${GREEN}MCP servers registered.${NC}"

# ── 6. Authenticate GitHub ────────────────────────────────────
echo ""
echo -e "${YELLOW}Next: Authenticate GitHub MCP in Claude Code:${NC}"
echo -e "  1. Run: ${GREEN}claude${NC}"
echo -e "  2. Type: ${GREEN}/mcp${NC}"
echo -e "  3. Select GitHub → Authenticate"
echo ""

# ── 7. Print next steps ───────────────────────────────────────
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  ${YELLOW}Start Claude Code in your project:${NC}"
echo -e "    cd your-project && claude"
echo ""
echo -e "  ${YELLOW}Verify MCP servers are connected:${NC}"
echo -e "    /mcp"
echo ""
echo -e "  ${YELLOW}Useful commands inside Claude Code:${NC}"
echo -e "    RESEARCH: how does X work"
echo -e "    PLAN: add user auth to the app"
echo -e "    BUILD: create the login component"
echo -e "    FIX: TypeError in src/app/page.tsx"
echo -e "    DEPLOY: the auth feature is ready"
echo -e "    AUTOMATE: save research to AFFiNE"
echo ""
echo -e "  ${YELLOW}Edit your project context:${NC}"
echo -e "    nano CLAUDE.md"
echo ""
echo -e "  ${YELLOW}Full docs:${NC} https://code.claude.com/docs/en/overview"
echo ""
