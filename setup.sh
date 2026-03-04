#!/bin/bash
set -e

# ==========================================
#  KnozySunucu - Tek Tıklık Kurulum & Başlatma
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

print_step() { echo -e "\n${GREEN}[✓]${NC} ${BOLD}$1${NC}"; }
print_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${CYAN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║   KnozySunucu - Kurulum & Başlatma       ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${NC}\n"

# ---- 1. Node.js kontrolü ----
print_step "Node.js kontrol ediliyor..."
if ! command -v node &> /dev/null; then
    print_warn "Node.js bulunamadı. Kuruluyor..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    else
        print_error "Paket yöneticisi bulunamadı. Node.js'i manuel kurun: https://nodejs.org"
        exit 1
    fi
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# ---- 2. .env dosyası ----
print_step ".env dosyası kontrol ediliyor..."
if [ ! -f ".env" ]; then
    print_warn ".env dosyası bulunamadı, oluşturuluyor..."

    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)

    echo ""
    read -p "  CurseForge API Key (boş bırakılabilir): " CF_KEY
    read -p "  Minecraft sunucu dizini [$SCRIPT_DIR/sunucular]: " MC_PATH
    MC_PATH=${MC_PATH:-$SCRIPT_DIR/sunucular}
    read -p "  Minecraft server JAR adı [forge-server.jar]: " MC_JAR
    MC_JAR=${MC_JAR:-forge-server.jar}
    read -p "  Max RAM [4G]: " MAX_RAM
    MAX_RAM=${MAX_RAM:-4G}
    read -p "  Min RAM [2G]: " MIN_RAM
    MIN_RAM=${MIN_RAM:-2G}
    read -p "  Yedek dizini [$SCRIPT_DIR/yedekler]: " BACKUP_DIR
    BACKUP_DIR=${BACKUP_DIR:-$SCRIPT_DIR/yedekler}
    read -p "  Panel portu [3001]: " PORT
    PORT=${PORT:-3001}

    cat > .env << EOF
# KnozySunucu - Ortam Değişkenleri
# Otomatik oluşturuldu: $(date)

JWT_SECRET=${JWT_SECRET}
PORT=${PORT}

CURSEFORGE_API_KEY=${CF_KEY}

MINECRAFT_SERVER_PATH=${MC_PATH}
MINECRAFT_SERVER_JAR=${MC_JAR}
MINECRAFT_MAX_RAM=${MAX_RAM}
MINECRAFT_MIN_RAM=${MIN_RAM}

BACKUP_PATH=${BACKUP_DIR}
EOF

    echo -e "  ${GREEN}.env dosyası oluşturuldu${NC}"
    mkdir -p "$BACKUP_DIR" 2>/dev/null || true
    mkdir -p "$MC_PATH" 2>/dev/null || true
else
    echo "  .env dosyası mevcut, atlanıyor."
fi

# ---- 3. Backend bağımlılıkları ----
print_step "Backend bağımlılıkları yükleniyor..."
cd "$SCRIPT_DIR/server"
npm install --production --silent
cd "$SCRIPT_DIR"

# ---- 4. Frontend build ----
print_step "Frontend build ediliyor..."
cd "$SCRIPT_DIR/client"
npm install --silent
npm run build 2>&1 | tail -3
cd "$SCRIPT_DIR"

# ---- 5. Build dosyalarını backend'e kopyala ----
print_step "Build dosyaları hazırlanıyor..."
rm -rf "$SCRIPT_DIR/server/public"
cp -r "$SCRIPT_DIR/client/dist" "$SCRIPT_DIR/server/public"
echo "  Build dosyaları server/public dizinine kopyalandı"

# ---- 6. PM2 ile başlat ----
print_step "PM2 ile sunucu başlatılıyor..."
if ! command -v pm2 &> /dev/null; then
    print_warn "PM2 kuruluyor..."
    sudo npm install -g pm2
fi

pm2 delete knozy-sunucu 2>/dev/null || true

cd "$SCRIPT_DIR/server"
pm2 start index.js --name knozy-sunucu --env production --max-memory-restart 512M
pm2 save --force
pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || true
cd "$SCRIPT_DIR"

# ---- 7. Tamamlandı ----
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "sunucu-ip")
PORT_VAL=$(grep "^PORT=" .env | cut -d'=' -f2)
PORT_VAL=${PORT_VAL:-3001}

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  ✓ KnozySunucu Başarıyla Başlatıldı!     ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Yerel Erişim:${NC}    http://localhost:${PORT_VAL}"
echo -e "  ${BOLD}Ağ Erişimi:${NC}      http://${SERVER_IP}:${PORT_VAL}"
echo ""
echo -e "  ${BOLD}Diğer Script'ler:${NC}"
echo -e "    Başlat:         ${CYAN}./start.sh${NC}"
echo -e "    Durdur:          ${CYAN}./stop.sh${NC}"
echo -e "    Güncelle:        ${CYAN}./update.sh${NC}"
echo ""
echo -e "  ${BOLD}PM2 Komutları:${NC}"
echo -e "    Durum:           pm2 status"
echo -e "    Loglar:          pm2 logs knozy-sunucu"
echo -e "    Yeniden başlat:  pm2 restart knozy-sunucu"
echo ""
echo -e "  ${YELLOW}İlk girişte admin hesabı oluşturmayı unutmayın!${NC}"
echo ""
