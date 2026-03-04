#!/bin/bash
# KnozySunucu - Hızlı Başlatma
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/server"

GREEN='\033[0;32m'
NC='\033[0m'
BOLD='\033[1m'

# PM2 yoksa doğrudan node ile başlat
if command -v pm2 &> /dev/null; then
    pm2 start index.js --name knozy-sunucu --env production 2>/dev/null || pm2 restart knozy-sunucu
    echo -e "${GREEN}${BOLD}✓ KnozySunucu başlatıldı (PM2)${NC}"
    echo "  Loglar: pm2 logs knozy-sunucu"
else
    echo -e "${GREEN}${BOLD}✓ KnozySunucu başlatılıyor...${NC}"
    node index.js
fi
