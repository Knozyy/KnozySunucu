#!/bin/bash
# KnozySunucu + KnozyBot - Hızlı Başlatma
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'

# ── KnozySunucu ────────────────────────────────────────────────
cd "$SCRIPT_DIR/server"
if command -v pm2 &> /dev/null; then
    pm2 start index.js --name knozy-sunucu --env production 2>/dev/null || pm2 restart knozy-sunucu
    echo -e "${GREEN}${BOLD}✓ KnozySunucu başlatıldı (PM2)${NC}"
    echo "  Loglar: pm2 logs knozy-sunucu"
else
    echo -e "${GREEN}${BOLD}✓ KnozySunucu başlatılıyor...${NC}"
    node index.js &
fi

# ── KnozyBot ───────────────────────────────────────────────────
BOT_DIR="$HOME/projects/KnozyBot"
if [ -d "$BOT_DIR" ]; then
    if command -v pm2 &> /dev/null; then
        cd "$BOT_DIR"
        pm2 start index.js --name knozy-bot --env production 2>/dev/null || pm2 restart knozy-bot
        echo -e "${GREEN}${BOLD}✓ KnozyBot başlatıldı (PM2)${NC}"
        echo "  Loglar: pm2 logs knozy-bot"
    fi
else
    echo "  KnozyBot dizini bulunamadı ($BOT_DIR), atlanıyor."
fi
