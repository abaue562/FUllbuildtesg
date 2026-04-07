# OSS STARTUP EMPIRE — Complete Full-Stack Operating System

A comprehensive, self-hosted alternative to enterprise SaaS tools. Replace $2,500-3,500/mo in SaaS costs with a ~$40-60/mo self-hosted stack. Everything pre-configured and ready to deploy.

## 🚀 What This Is

A complete startup operating system with 22+ containerized services, AI automation workflows, voice agents, content generation, video pipelines, and more. Run everything on a single VPS or docker-compose locally.

**Replacement Values:**
- Perplexica → Perplexity Pro
- SurfSense → NotebookLM  
- AFFiNE → Notion
- Chatwoot → Intercom
- Fonoster + LiveKit → Twilio + Vapi
- n8n + AI agents → Make/Zapier + automation
- ComfyUI + Whisper → OpenAI + other APIs

---

## 📦 Project Structure

### Core Docker Stacks
| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | Perplexica, SurfSense, AFFiNE, n8n, Coolify | Core productivity & automation |
| `docker-compose.infra.yml` | Supabase, Meilisearch, Unleash, GlitchTip, Temporal, Redpanda | Data layer & infrastructure |
| `comms/docker-compose.comms.yml` | Fonoster, WAHA, Chatwoot, LiveKit, TextBee, Ntfy | Communications (Voice/WhatsApp/SMS) |
| `comms/docker-compose.leverage.yml` | Mem0, Firecrawl, Formbricks, GrowthBook, NocoDB | Data enrichment & analytics |
| `video/docker-compose.video.yml` | ComfyUI, Whisper, Video Analyzer, MinIO, Qdrant | Media generation & analysis |

### Key Components
- **`agents/receptionist.py`** – AI phone receptionist (15x cheaper than Vapi/Bland)
- **`webgl/index.tsx`** – Unicorn Studio clone (R3F + custom GLSL shaders)
- **`directory/templates.ts`** – SEO-optimized directory site template (Next.js)
- **`claude-code/CLAUDE.md`** – Master command reference + MCP configuration
- **`setup.sh`** – One-command VPS installer
- **`setup-claude-code.sh`** – Claude Code integration + all MCP servers
- **`manage.sh`** – Service lifecycle management (start/stop/backup/update)

### Automation Workflows (n8n-workflows/)
| ID | Name | Purpose |
|----|------|---------|
| 01 | Research Pipeline | Perplexica + Firecrawl scraping → research summaries |
| 02 | GitHub Deploy Notify | Monitor GitHub commits → Slack/Discord |
| 03 | Morning Briefing | Daily news digest → email |
| 04 | Error Monitor | Catch errors across all services → alert |
| 05 | Session Logger | Archive work sessions → Notion |
| 06 | Competitor Digest | Track competitors → reports |
| 07 | Video Generation | Text → script → voiceover → video |
| 08 | Video Analysis | Transcribe + scene detection + insights |
| 17 | SMS Phone Farm | Load balance SMS across real Android phones |
| 18 | Appointment Cascade | Cal.com → Email + SMS + WhatsApp + Push + AI call |
| 22 | Faceless Channel | Topic → script → voiceover → video → YouTube + distribution |

---

## 🔌 Services & Ports

```
3001  Perplexica              (Search + synthesis)
3002  SurfSense               (Audio/document analysis)
3004  AFFiNE                  (Document/note workspace)
3100  WAHA                    (WhatsApp API)
3200  Chatwoot                (Customer messaging)
3300  Ntfy                    (Push notifications)
3400  TextBee                 (SMS gateway)
3500  Firecrawl               (Web scraper)
3600  Uptime Kuma             (Monitoring dashboard)
3700  FreshRSS                (RSS feed reader)
3800  Formbricks             (Survey/form builder)
3900  GrowthBook             (A/B testing)
4000  NocoDB                 (Database UI)
4242  Unleash                (Feature flags)
5678  n8n                    (Workflow automation)
7700  Meilisearch            (Full-text search)
7880  LiveKit                (WebRTC + AI voice)
8000  Coolify                (Internal PaaS)
8090  Redpanda Console       (Message queue)
8091  PocketBase             (BaaS)
8100  Mem0                   (AI memory)
8188  ComfyUI                (Image/video generation)
8200  GlitchTip              (Error tracking)
50051 Fonoster               (Telecom API)
```

---

## ⚡ Quick Start

### Prerequisites
- Docker & Docker Compose
- 4GB+ RAM, 20GB+ disk
- ANTHROPIC_API_KEY (for Claude integration)

### Setup (5 minutes)
```bash
# 1. Clone & setup environment
git clone https://github.com/YOU/FUllbuildtesg.git
cd master
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY + SERVER_IP

# 2. Start core stack
docker compose up -d

# 3. Start communications layer
docker compose -f comms/docker-compose.comms.yml up -d

# 4. Start video pipeline (optional)
docker compose -f video/docker-compose.video.yml up -d

# 5. Setup Claude Code integration
./setup-claude-code.sh

# 6. Import n8n workflows
# Go to http://localhost:5678 → Import all JSON files from n8n-workflows/

# 7. Start building
cat claude-code/CLAUDE.md  # Read command reference
```

---

## 🎯 Claude Code Commands

The system includes pre-built commands for common tasks:

```
RESEARCH   → Query + Firecrawl scrape → AFFiNE notes
PLAN       → Architecture review + approval workflow
BUILD      → Code generation + testing + commit
FIX        → Diagnose + patch + test
CALL       → Route to Fonoster → LiveKit AI agent
WHATSAPP   → Compose → WAHA send
SMS        → Queue → TextBee send
REMIND     → Multi-channel: email+SMS+WA+push+call
CONTENT    → 50-source research → blog+socials+video+images
CAMPAIGN   → 30-day content pipeline
VIDEO-GEN  → Script → voiceover → music → distribute
DEPLOY     → GitHub push → Coolify deploy
AUTOMATE   → Build n8n workflow via MCP
AGENT      → Spawn researcher/builder/shipper subagents
```

See `claude-code/CLAUDE.md` for full reference.

---

## 🏗️ Architecture

**Stack:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Postgres (Prisma ORM)
- Redis
- Supabase (realtime)
- Meilisearch (search)

**Integration:**
- Claude AI (via Anthropic API)
- MCP servers (filesystem, GitHub, PostgreSQL, n8n, Playwright)
- n8n (workflow engine)
- Docker orchestration

---

## 🔐 Environment Setup

Create `.env` from `.env.example`:

```bash
ANTHROPIC_API_KEY=sk-...           # Required: Claude API key
SERVER_IP=192.168.1.100           # Your VPS/server IP
POSTGRES_PASSWORD=secure-password  # Database password
REDIS_PASSWORD=secure-password     # Redis password
SUPABASE_URL=https://...          # If using Supabase
SUPABASE_ANON_KEY=...            # Supabase anon key
```

---

## 📚 Documentation

- **[claude-code/CLAUDE.md](claude-code/CLAUDE.md)** – Master OS + command reference
- **[video/VIDEO_SETUP.md](video/VIDEO_SETUP.md)** – Media pipeline setup
- **[n8n-workflows/ENV_SETUP.md](n8n-workflows/ENV_SETUP.md)** – Workflow environment customization

---

## 🚀 Deployment

### Local Development
```bash
docker compose up -d
./manage.sh start
```

### VPS Deployment
```bash
./setup.sh  # One-shot installer on Ubuntu 22.04+ VPS
```

### Coolify (Internal PaaS)
Deploy services via Coolify dashboard at `http://localhost:8000`

---

## 🛠️ Management

```bash
./manage.sh start          # Start all services
./manage.sh stop           # Stop all services
./manage.sh backup         # Backup databases
./manage.sh update         # Pull latest images
./manage.sh logs [service] # View service logs
```

---

## 💡 Use Cases

✅ **Solopreneur Studio** – Research, content, video, automation  
✅ **Startup Ops** – Customer comms, team workflows, monitoring  
✅ **Agency Services** – Client content generation, landing pages, campaigns  
✅ **Lead Generation** – Research pipelines, outreach automation, CRM  
✅ **Content Networks** – Faceless channels, TikTok/YouTube distribution  
✅ **B2B Directory** – SEO-optimized business listings  

---

## 📝 License

MIT License – See LICENSE file

---

## 🤝 Contributing

PRs welcome! Areas for improvement:
- Additional n8n workflow templates
- Mobile app (Expo) boilerplate  
- Additional LLM integrations (GPT-4, Gemini, etc.)
- Terraform/Pulumi IaC for cloud deployment
- Kubernetes manifests

---

## 🔗 Resources

- [n8n Docs](https://docs.n8n.io)
- [Docker Compose Docs](https://docs.docker.com/compose)
- [Claude API Docs](https://docs.anthropic.com)
- [Anthropic MCP Docs](https://modelcontextprotocol.io)

---

## 📧 Support

For issues, questions, or feature requests, open a GitHub issue or check our documentation.
