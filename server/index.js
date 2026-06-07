// KnozySunucu Panel
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ── JWT_SECRET güvencesi ────────────────────────────────────────────────────
// JWT_SECRET tanımsızsa tüm kimlik doğrulama sessizce kırılır (login 500 döner,
// jwt.verify 401 verir) ve teşhisi zordur. Tanımlı değilse güvenli rastgele bir
// değer üretip .env'e kalıcı yazıyoruz; böylece panel kutudan çıktığı gibi
// çalışır ve üretilen token'lar yeniden başlatmalar arasında geçerli kalır.
function ensureJwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) return;
    const crypto = require('crypto');
    const secret = crypto.randomBytes(48).toString('hex');
    process.env.JWT_SECRET = secret;
    try {
        const envPath = path.resolve(__dirname, '../.env');
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        if (/^JWT_SECRET=.*$/m.test(content)) {
            // Var olan (muhtemelen boş) tanımı değiştir — tekrar üretmeyi önler
            content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
        } else {
            if (content && !content.endsWith('\n')) content += '\n';
            content += `JWT_SECRET=${secret}\n`;
        }
        fs.writeFileSync(envPath, content);
        console.warn('[Güvenlik] JWT_SECRET tanımlı değildi; rastgele üretilip .env dosyasına yazıldı.');
    } catch (err) {
        console.warn('[Güvenlik] JWT_SECRET üretildi fakat .env\'e yazılamadı (bellek içi kullanılacak):', err.message);
    }
}
ensureJwtSecret();

// ── Eski 'Hitler' kurtarma hesabını geçersiz kıl ────────────────────────────
// Backdoor env'e taşınmadan önce DB'de oluşturulmuş bir 'Hitler' hesabı varsa
// parolası hâlâ 'Knozy' hash'i olabilir → env boş olsa bile normal girişle admin
// verebilir. Başlangıçta tespit edip parolayı rastgele değerle geçersiz kılıyoruz.
function invalidateLegacyMasterAccount() {
    try {
        const { getDb } = require('./db/database');
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        const db = getDb();
        const user = db.prepare("SELECT id, password FROM users WHERE LOWER(username) = 'hitler'").get();
        if (!user) return;
        const isLegacy = bcrypt.compareSync('Knozy', user.password);
        if (isLegacy) {
            const newHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
            db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, user.id);
            console.warn('[Güvenlik] Eski master hesabı tespit edildi; parolası geçersiz kılındı. Kurtarma için MASTER_KEY_SECRET kullanın.');
        }
    } catch (err) {
        console.warn('[Güvenlik] Legacy master hesap kontrolü başarısız:', err.message);
    }
}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { initDatabase } = require('./db/database');
const { setupWebSockets } = require('./services/wsRouter');

const authRoutes = require('./routes/auth');
const systemRoutes = require('./routes/system');
const minecraftRoutes = require('./routes/minecraft');
const modpackRoutes = require('./routes/modpacks');
const backupRoutes = require('./routes/backup');
const logRoutes = require('./routes/logs');
const javaRoutes = require('./routes/java');
const fileRoutes = require('./routes/files');
const playerRoutes = require('./routes/players');
const modRoutes = require('./routes/mods');
const worldRoutes = require('./routes/worlds');
const schedulerRoutes = require('./routes/scheduler');
const notificationRoutes = require('./routes/notifications');
const usersRoutes = require('./routes/users');
const terminalRoutes = require('./routes/terminal');
const discordRoutes = require('./routes/discord');
const permCatRoutes = require('./routes/permissionCategories');
const automationRoutes = require('./routes/automation');
const macroRoutes = require('./routes/macros');
const apiTokenRoutes = require('./routes/apiTokens');
const auditRoutes = require('./routes/audit');
const templateRoutes = require('./routes/templates');
const serverListRoutes = require('./routes/servers');
const dashboardRoutes = require('./routes/dashboard');
const pushRoutes = require('./routes/push');
const lagGuardRoutes = require('./routes/lagGuard');
const minecraftService = require('./services/minecraftService');
const serverRegistry = require('./services/serverRegistry');

const app = express();
const server = http.createServer(app);

// ── Güvenlik başlıkları (helmet) ────────────────────────────────────────────
// X-Frame-Options, X-Content-Type-Options, HSTS vb. — clickjacking + MIME sniff koruması
app.use(helmet({ contentSecurityPolicy: false })); // CSP kapalı: inline script/style kullanan SPA ile çakışmaz

// ── Rate limiting ────────────────────────────────────────────────────────────
// Login brute-force koruması: 15 dakikada en fazla 20 başarısız deneme
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' },
    skipSuccessfulRequests: true, // Başarılı girişleri saymaz
});
app.use('/api/auth/login', loginLimiter);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(compression()); // Gzip sıkıştırma — JS/CSS boyutunu ~%70 azaltır
// CORS: production'da ALLOWED_ORIGIN env ile kısıtla, yoksa localhost geliştirme varsayılanı
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Database
initDatabase();
invalidateLegacyMasterAccount();

// ServerRegistry — DB'deki tüm sunucular için instance hazırla
// (panel yeniden başlasa bile çalışan screen'leri yakalar)
serverRegistry.initialize();

// LagGuard — metrik toplama (event yayını minecraftService singleton'ında olduğu
// için doğrudan ona bağlanıyoruz; gevşek bağlılık)
try {
    const lagGuard = require('./services/lagGuard');
    lagGuard.init();
    lagGuard.attach(minecraftService);
} catch (err) {
    console.warn('[LagGuard] Başlatılamadı:', err.message);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/minecraft', minecraftRoutes);
app.use('/api/modpacks', modpackRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/java', javaRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/mods', modRoutes);
app.use('/api/worlds', worldRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/permission-categories', permCatRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/macros', macroRoutes);
app.use('/api/tokens', apiTokenRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/servers', serverListRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/lag-guard', lagGuardRoutes);

// Health check — startTime sunucu yeniden başlayınca değişir, frontend bunu algılar
const SERVER_START_TIME = Date.now();
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', startTime: SERVER_START_TIME, timestamp: new Date().toISOString() });
});

// Production: Serve frontend build files
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.use((req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Frontend build not found. Run: cd client && npm run build' });
    }
});

// Süreli whitelist periyodik kontrolü
require('./services/timedWhitelistService').start();

// Discord webhook bildirimleri
require('./services/webhookListener').start();

// WebSocket router — console + terminal
setupWebSockets(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sunucu Paneli] Port ${PORT} uzerinde calisiyor`);

    // Item dokuları için vanilla jar'ı arka planda önceden indir (ilk envanter açılışı beklemesin)
    try {
        const itemTextures = require('./services/itemTextures');
        const inst = serverRegistry.getDefault();
        const sp = inst?.getServerPath?.() || process.env.MINECRAFT_SERVER_PATH;
        if (sp) itemTextures.warmUp(sp);
    } catch { /* ısınma başarısızsa lazy çözüm yine çalışır */ }
});
