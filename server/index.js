// KnozySunucu Panel
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const compression = require('compression');
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
const minecraftService = require('./services/minecraftService');
const { serverManager } = require('./services/serverManager');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(compression()); // Gzip sıkıştırma — JS/CSS boyutunu ~%70 azaltır
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Database
initDatabase();

// ServerManager — birincil sunucuyu kaydet
serverManager.setPrimary(minecraftService);

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
});
