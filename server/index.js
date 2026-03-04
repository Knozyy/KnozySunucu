const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { initDatabase } = require('./db/database');
const { setupWebSocket } = require('./services/consoleService');

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

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Database
initDatabase();

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: Serve frontend build files
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Frontend build not found. Run: cd client && npm run build' });
    }
});

// WebSocket for console
setupWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sunucu Paneli] Port ${PORT} uzerinde calisiyor`);
});
