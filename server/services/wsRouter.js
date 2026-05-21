const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { URL } = require('url');
const minecraftService = require('./minecraftService');
const terminalService = require('./terminalService');

/**
 * Tek WebSocket sunucusu — path'e göre yönlendirme
 * ws kütüphanesinde aynı http.Server üzerine birden fazla
 * WebSocket.Server kurmak upgrade eventinde çakışmaya yol açar.
 */

const wss = new WebSocket.Server({ noServer: true });

// ─── Yardımcı: token doğrula ──────────────────────────────────────────────
function verifyToken(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

// ─── Belirli sunucu instance'ını getir ───────────────────────────────────
function getServiceInstance(serverId) {
    if (!serverId) return minecraftService; // Birincil (legacy)
    try {
        const { serverManager } = require('./serverManager');
        const id = parseInt(serverId);
        if (isNaN(id)) return minecraftService;
        const instance = serverManager.getInstance(id);
        return instance || minecraftService;
    } catch {
        return minecraftService;
    }
}

// ─── /ws/console handler ─────────────────────────────────────────────────
function handleConsole(ws, serverId) {
    const service = getServiceInstance(serverId);

    const recentLogs = service.getRecentLogs ? service.getRecentLogs(100) : [];
    recentLogs.forEach(log => {
        ws.send(JSON.stringify({ type: 'log', data: log.message }));
    });
    ws.send(JSON.stringify({ type: 'status', data: service.getStatus() }));

    const logHandler = (line) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'log', data: line }));
    };
    const statusHandler = (status) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'status', data: { status } }));
    };
    const playersHandler = (players) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'players', data: players }));
    };
    const crashHandler = (data) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'crash', data }));
    };

    service.on('log', logHandler);
    service.on('status', statusHandler);
    service.on('players', playersHandler);
    service.on('crash', crashHandler);

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            if (parsed.type === 'command' && parsed.data)
                service.sendCommand(parsed.data);
        } catch { /* ignore */ }
    });

    ws.on('close', () => {
        service.off('log', logHandler);
        service.off('status', statusHandler);
        service.off('players', playersHandler);
        service.off('crash', crashHandler);
    });
}

// ─── /ws/terminal handler ─────────────────────────────────────────────────
function handleTerminal(ws) {
    terminalService.addClient(ws);

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            if (parsed.type === 'input') terminalService.write(parsed.data);
            else if (parsed.type === 'resize') terminalService.resize(parsed.cols, parsed.rows);
        } catch { /* ignore */ }
    });

    ws.on('close', () => terminalService.removeClient(ws));
}

// ─── Upgrade Router ───────────────────────────────────────────────────────
function setupWebSockets(server) {
    server.on('upgrade', (req, socket, head) => {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const pathname = urlObj.pathname;

        if (pathname !== '/ws/console' && pathname !== '/ws/terminal') {
            socket.destroy();
            return;
        }

        const user = verifyToken(req);
        if (!user) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        const serverId = urlObj.searchParams.get('serverId') || null;

        wss.handleUpgrade(req, socket, head, (ws) => {
            if (pathname === '/ws/console') handleConsole(ws, serverId);
            else handleTerminal(ws);
        });
    });
}

module.exports = { setupWebSockets };
