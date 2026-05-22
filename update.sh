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

echo -e "\n${CYAN}${BOLD}KnozySunucu + KnozyBot Güncelleniyor...${NC}\n"

# 1. Git pull — KnozySunucu
echo -e "${YELLOW}[1/5]${NC} KnozySunucu değişiklikleri çekiliyor..."
git pull origin main

# 2. Backend deps
echo -e "${YELLOW}[2/5]${NC} Backend bağımlılıkları güncelleniyor..."
cd "$SCRIPT_DIR/server"
npm install --production --silent
cd "$SCRIPT_DIR"

# 3. Frontend rebuild
echo -e "${YELLOW}[3/5]${NC} Frontend yeniden build ediliyor..."
cd "$SCRIPT_DIR/client"
npm install --silent
npm run build 2>&1 | tail -3
cd "$SCRIPT_DIR"

# Build kopyala
rm -rf "$SCRIPT_DIR/server/public"
cp -r "$SCRIPT_DIR/client/dist" "$SCRIPT_DIR/server/public"

# 4. KnozyBot güncelle
BOT_DIR="$HOME/projects/KnozyBot"
echo -e "${YELLOW}[4/5]${NC} KnozyBot güncelleniyor..."
if [ -d "$BOT_DIR" ]; then
    cd "$BOT_DIR"
    git pull origin main 2>&1 | tail -2
    npm install --production --silent
    cd "$SCRIPT_DIR"
    echo -e "  → KnozyBot güncellendi."
else
    echo -e "  → KnozyBot dizini bulunamadı ($BOT_DIR), atlanıyor."
fi

# 5. Restart
echo -e "${YELLOW}[5/5]${NC} Servisler yeniden başlatılıyor..."
if command -v pm2 &> /dev/null; then
    nohup bash -c "sleep 2 && pm2 restart knozy-sunucu && pm2 restart knozy-bot 2>/dev/null; true" > /dev/null 2>&1 &
    echo -e "  → Restart 2 saniye içinde arka planda gerçekleşecek."
else
    echo "PM2 bulunamadı, manuel restart gerekli."
fi

echo -e "\n${GREEN}${BOLD}✓ Güncelleme tamamlandı! Servisler birkaç saniye içinde yeniden başlayacak.${NC}\n"
