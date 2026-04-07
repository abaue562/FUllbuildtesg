#!/bin/bash
# ============================================================
# OSS STACK MANAGER
# Usage: ./manage.sh [command]
# Commands: start | stop | restart | status | logs [service] | update
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

case "$1" in
  start)
    echo -e "${GREEN}Starting OSS stack...${NC}"
    docker compose up -d
    ;;

  stop)
    echo -e "${YELLOW}Stopping OSS stack...${NC}"
    docker compose down
    ;;

  restart)
    echo -e "${YELLOW}Restarting OSS stack...${NC}"
    docker compose down && docker compose up -d
    ;;

  status)
    echo -e "${GREEN}Service status:${NC}"
    docker compose ps
    ;;

  logs)
    SERVICE=${2:-""}
    if [ -z "$SERVICE" ]; then
      docker compose logs -f --tail=100
    else
      docker compose logs -f --tail=100 "$SERVICE"
    fi
    ;;

  update)
    echo -e "${YELLOW}Pulling latest images and restarting...${NC}"
    docker compose pull
    docker compose up -d --force-recreate
    echo -e "${GREEN}Update complete.${NC}"
    ;;

  backup)
    DATE=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="./backups/$DATE"
    mkdir -p "$BACKUP_DIR"
    echo -e "${YELLOW}Backing up databases to $BACKUP_DIR...${NC}"
    # AFFiNE
    docker exec affine-db pg_dump -U affine affine > "$BACKUP_DIR/affine.sql"
    # SurfSense
    docker exec surfsense-db pg_dump -U surfsense surfsense > "$BACKUP_DIR/surfsense.sql"
    # n8n
    docker cp n8n:/home/node/.n8n "$BACKUP_DIR/n8n-data"
    echo -e "${GREEN}Backup saved to $BACKUP_DIR${NC}"
    ;;

  urls)
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo -e "${GREEN}Service URLs:${NC}"
    echo -e "  🔍 Perplexica     http://${SERVER_IP}:3001"
    echo -e "  📓 SurfSense      http://${SERVER_IP}:3002"
    echo -e "  📚 AnythingLLM    http://${SERVER_IP}:3003"
    echo -e "  📋 AFFiNE         http://${SERVER_IP}:3004"
    echo -e "  🔗 n8n            http://${SERVER_IP}:5678"
    echo -e "  ▲  Coolify        http://${SERVER_IP}:8000"
    echo ""
    ;;

  *)
    echo "Usage: ./manage.sh [start|stop|restart|status|logs|update|backup|urls]"
    echo ""
    echo "  start     — start all services"
    echo "  stop      — stop all services"
    echo "  restart   — restart all services"
    echo "  status    — show container status"
    echo "  logs      — tail all logs (or: logs perplexica-frontend)"
    echo "  update    — pull latest images and restart"
    echo "  backup    — dump databases to ./backups/"
    echo "  urls      — print all service access URLs"
    ;;
esac
