#!/bin/bash
# KnozySunucu - Güncelleme (git pull + rebuild + restart)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "\n${CYAN}${BOLD}KnozySunucu Güncelleniyor...${NC}\n"

# 1. Git pull
echo -e "${YELLOW}[1/4]${NC} Değişiklikler çekiliyor..."
git pull origin main

# 2. Backend deps
echo -e "${YELLOW}[2/4]${NC} Backend bağımlılıkları güncelleniyor..."
cd "$SCRIPT_DIR/server"
npm install --production --silent
cd "$SCRIPT_DIR"

# 3. Frontend rebuild
echo -e "${YELLOW}[3/4]${NC} Frontend yeniden build ediliyor..."
cd "$SCRIPT_DIR/client"
npm install --silent
npm run build 2>&1 | tail -3
cd "$SCRIPT_DIR"

# Build kopyala
rm -rf "$SCRIPT_DIR/server/public"
cp -r "$SCRIPT_DIR/client/dist" "$SCRIPT_DIR/server/public"

# 4. Restart
echo -e "${YELLOW}[4/4]${NC} Panel yeniden başlatılıyor..."
if command -v pm2 &> /dev/null; then
    pm2 restart knozy-sunucu
else
    echo "PM2 bulunamadı, manuel restart gerekli."
fi

echo -e "\n${GREEN}${BOLD}✓ Güncelleme tamamlandı!${NC}\n"
