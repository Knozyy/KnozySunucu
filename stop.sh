#!/bin/bash
# KnozySunucu - Durdurma
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

if command -v pm2 &> /dev/null; then
    pm2 stop knozy-sunucu 2>/dev/null && echo -e "${RED}${BOLD}■ KnozySunucu durduruldu${NC}" || echo "Zaten durmuş."
else
    pkill -f "node.*index.js" 2>/dev/null && echo -e "${RED}${BOLD}■ KnozySunucu durduruldu${NC}" || echo "Çalışan işlem bulunamadı."
fi
