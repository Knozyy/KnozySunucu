const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const minecraftService = require('./minecraftService');

let wss = null;

function setupWebSocket(server) {
    wss = new WebSocket.Server({ server, path: '/ws/console' });

    wss.on('connection', (ws, req) => {
        // Authenticate via query param
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
            ws.close(4001, 'Token gerekli');
            return;
        }

        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            ws.close(4001, 'Geçersiz token');
            return;
        }

        // Send recent logs on connect
        const recentLogs = minecraftService.getRecentLogs(100);
        recentLogs.forEach(log => {
            ws.send(JSON.stringify({ type: 'log', data: log.message }));
        });

        // Send current status
        ws.send(JSON.stringify({
            type: 'status',
            data: minecraftService.getStatus(),
        }));

        // Listen for minecraft events
        const logHandler = (line) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'log', data: line }));
            }
        };

        const statusHandler = (status) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'status', data: { status } }));
            }
        };

        const playersHandler = (players) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'players', data: players }));
            }
        };

        minecraftService.on('log', logHandler);
        minecraftService.on('status', statusHandler);
        minecraftService.on('players', playersHandler);

        // Handle commands from client
        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                if (parsed.type === 'command' && parsed.data) {
                    minecraftService.sendCommand(parsed.data);
                }
            } catch {
                // Ignore malformed messages
            }
        });

        ws.on('close', () => {
            minecraftService.off('log', logHandler);
            minecraftService.off('status', statusHandler);
            minecraftService.off('players', playersHandler);
        });
    });
}

module.exports = { setupWebSocket };
