const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const terminalService = require('./terminalService');

function setupTerminalWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws/terminal' });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) { ws.close(4001, 'Token gerekli'); return; }
        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            ws.close(4001, 'Geçersiz token'); return;
        }

        terminalService.addClient(ws);

        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                if (parsed.type === 'input') {
                    terminalService.write(parsed.data);
                } else if (parsed.type === 'resize') {
                    terminalService.resize(parsed.cols, parsed.rows);
                }
            } catch { /* malformed message */ }
        });

        ws.on('close', () => {
            terminalService.removeClient(ws);
        });
    });
}

module.exports = { setupTerminalWebSocket };
