#!/bin/bash
set -e

# ==========================================
#  Sunucu Paneli - Tek Tıklık Kurulum & Başlatma
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

print_step() { echo -e "\n${GREEN}[✓]${NC} ${BOLD}$1${NC}"; }
print_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${BOLD}========================================${NC}"
echo -e "${BOLD}  Sunucu Paneli - Kurulum & Başlatma${NC}"
echo -e "${BOLD}========================================${NC}\n"

# ---- 1. Node.js kontrolü ----
print_step "Node.js kontrol ediliyor..."
if ! command -v node &> /dev/null; then
    print_warn "Node.js bulunamadı. Kuruluyor..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# ---- 2. .env dosyası ----
print_step ".env dosyası kontrol ediliyor..."
if [ ! -f ".env" ]; then
    print_warn ".env dosyası bulunamadı, oluşturuluyor..."

    # Rastgele JWT secret oluştur
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)

    # Kullanıcıdan bilgi al
    echo ""
    read -p "  CurseForge API Key (boş bırakılabilir): " CF_KEY
    read -p "  Minecraft sunucu dizini [/home/minecraft/server]: " MC_PATH
    MC_PATH=${MC_PATH:-/home/minecraft/server}
    read -p "  Minecraft server JAR adı [forge-server.jar]: " MC_JAR
    MC_JAR=${MC_JAR:-forge-server.jar}
    read -p "  Max RAM [4G]: " MAX_RAM
    MAX_RAM=${MAX_RAM:-4G}
    read -p "  Min RAM [2G]: " MIN_RAM
    MIN_RAM=${MIN_RAM:-2G}
    read -p "  Yedek dizini [/home/minecraft/backups]: " BACKUP_DIR
    BACKUP_DIR=${BACKUP_DIR:-/home/minecraft/backups}
    read -p "  Panel portu [3001]: " PORT
    PORT=${PORT:-3001}

    cat > .env << EOF
# Sunucu Paneli - Ortam Değişkenleri
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

    # Yedek ve MC dizinlerini oluştur
    mkdir -p "$BACKUP_DIR" 2>/dev/null || true
    mkdir -p "$MC_PATH" 2>/dev/null || true
else
    echo "  .env dosyası mevcut, atlanıyor."
fi

# ---- 3. Backend bağımlılıkları ----
print_step "Backend bağımlılıkları yükleniyor..."
cd "$SCRIPT_DIR/server"
npm install --production
cd "$SCRIPT_DIR"

# ---- 4. Frontend bağımlılıkları ve build ----
print_step "Frontend bağımlılıkları yükleniyor ve build ediliyor..."
cd "$SCRIPT_DIR/client"
npm install
npm run build
cd "$SCRIPT_DIR"

# ---- 5. Build dosyalarını backend'e kopyala (static serve) ----
print_step "Frontend build dosyaları hazırlanıyor..."
rm -rf "$SCRIPT_DIR/server/public"
cp -r "$SCRIPT_DIR/client/dist" "$SCRIPT_DIR/server/public"
echo "  Build dosyaları server/public dizinine kopyalandı"

# ---- 6. PM2 kurulumu ve başlatma ----
print_step "PM2 ile sunucu başlatılıyor..."
if ! command -v pm2 &> /dev/null; then
    print_warn "PM2 kuruluyor..."
    sudo npm install -g pm2
fi

# Eğer zaten çalışıyorsa durdur
pm2 delete sunucu-paneli 2>/dev/null || true

cd "$SCRIPT_DIR/server"
pm2 start index.js --name sunucu-paneli --env production
pm2 save

# Sistem başlangıcında otomatik başlatma
pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || true

cd "$SCRIPT_DIR"

# ---- 7. Tamamlandı ----
SERVER_IP=$(hostname -I | awk '{print $1}')
PORT_VAL=$(grep "^PORT=" .env | cut -d'=' -f2)
PORT_VAL=${PORT_VAL:-3001}

echo ""
echo -e "${GREEN}${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}  ✓ Sunucu Paneli Başarıyla Başlatıldı!${NC}"
echo -e "${GREEN}${BOLD}========================================${NC}"
echo ""
echo -e "  ${BOLD}Yerel Erişim:${NC}    http://localhost:${PORT_VAL}"
echo -e "  ${BOLD}Ağ Erişimi:${NC}      http://${SERVER_IP}:${PORT_VAL}"
echo ""
echo -e "  ${BOLD}PM2 Komutları:${NC}"
echo -e "    Durum:          pm2 status"
echo -e "    Loglar:         pm2 logs sunucu-paneli"
echo -e "    Yeniden başlat: pm2 restart sunucu-paneli"
echo -e "    Durdur:         pm2 stop sunucu-paneli"
echo ""
echo -e "  ${YELLOW}İlk girişte admin hesabı oluşturmayı unutmayın!${NC}"
echo ""
