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

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket for console
setupWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.error(`[KnozySunucu] Server running on port ${PORT}`);
});
