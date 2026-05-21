const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { URL } = require('url');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const minecraftService = require('./minecraftService');
const terminalService = require('./terminalService');

const wss = new WebSocket.Server({ noServer: true });

// ─── Token doğrula ────────────────────────────────────────────────────────
function verifyToken(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;
    try { return jwt.verify(token, process.env.JWT_SECRET); }
    catch { return null; }
}

// ─── Sunucu için log dosyası yolu ─────────────────────────────────────────
function logFileFor(serverId) {
    if (!serverId) return '/tmp/knozy-mc.log';
    return `/tmp/knozy-mc${serverId}.log`;
}

// ─── Sunucu için screen adı ───────────────────────────────────────────────
function screenNameFor(serverId) {
    if (!serverId) return process.env.MINECRAFT_SCREEN_NAME || 'knozy-mc';
    return `knozy-mc${serverId}`;
}

// ─── Screen var mı? ───────────────────────────────────────────────────────
function isScreenRunning(screenName) {
    try {
        const out = execSync('screen -ls 2>/dev/null || true', { encoding: 'utf8' });
        return out.includes(screenName);
    } catch { return false; }
}

// ─── Screen'e komut gönder ────────────────────────────────────────────────
function sendToScreen(screenName, command) {
    try {
        execSync(`screen -S ${screenName} -p 0 -X stuff "${command.replace(/"/g, '\\"')}\n"`, { stdio: 'ignore' });
        return true;
    } catch { return false; }
}

// ─── Birincil sunucu için MinecraftService status'unu getir ──────────────
function getServiceStatus(serverId) {
    try {
        if (!serverId) return minecraftService.getStatus();
        const { serverManager } = require('./serverManager');
        const id = parseInt(serverId);
        const inst = serverManager._instances?.get(id);
        return inst ? inst.getStatus() : { status: 'stopped', players: [], playerCount: 0, processStats: { cpuPercent: 0, memoryMB: 0 } };
    } catch {
        return { status: 'stopped', players: [], playerCount: 0, processStats: { cpuPercent: 0, memoryMB: 0 } };
    }
}

// ─── /ws/console handler — log dosyasını doğrudan tail et ─────────────────
function handleConsole(ws, serverId) {
    const logFile  = logFileFor(serverId);
    const screenNm = screenNameFor(serverId);

    // 1) Anlık durum gönder
    ws.send(JSON.stringify({ type: 'status', data: getServiceStatus(serverId) }));

    // 2) Log dosyası yoksa oluştur
    if (!fs.existsSync(logFile)) {
        try { fs.writeFileSync(logFile, ''); } catch { /* ignore */ }
    }

    // 3) Son 100 satırı gönder
    try {
        const recent = execSync(`tail -n 100 "${logFile}" 2>/dev/null || true`, { encoding: 'utf8' });
        recent.split('\n').filter(Boolean).forEach(line => {
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'log', data: line }));
        });
    } catch { /* ignore */ }

    // 4) tail -f ile canlı akış
    let tailProc = null;
    let buffer = '';

    function startTail() {
        if (tailProc) { try { tailProc.kill(); } catch { /* */ } }
        tailProc = spawn('tail', ['-n', '0', '-f', logFile], { stdio: ['ignore', 'pipe', 'ignore'] });

        tailProc.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const t = line.trim();
                if (!t) continue;
                if (ws.readyState === WebSocket.OPEN)
                    ws.send(JSON.stringify({ type: 'log', data: t }));
            }
        });

        tailProc.on('close', () => { tailProc = null; });
    }

    startTail();

    // 5) Durum yoklama — her 3sn birincil servis event'lerini almak yerine
    //    doğrudan serverManager'dan sorgula
    const statusInterval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) { clearInterval(statusInterval); return; }
        try {
            const st = getServiceStatus(serverId);
            ws.send(JSON.stringify({ type: 'status', data: st }));
        } catch { /* ignore */ }
    }, 3000);

    // 6) MinecraftService event'leri de dinle (birincil sunucu için tam destek)
    //    — ikincil sunucu için sadece log dosyası yeterli, ama crash event'i için tutuyoruz
    const crashHandler = (data) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'crash', data }));
    };
    try {
        if (!serverId) {
            minecraftService.on('crash', crashHandler);
        } else {
            const { serverManager } = require('./serverManager');
            const id = parseInt(serverId);
            const inst = serverManager._instances?.get(id);
            if (inst) inst.on('crash', crashHandler);
        }
    } catch { /* ignore */ }

    // 7) Komut alma
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            if (parsed.type !== 'command' || !parsed.data) return;
            const cmd = parsed.data.trim();
            if (!cmd) return;

            // Önce screen'e gönder (doğrudan, güvenilir)
            const sent = sendToScreen(screenNm, cmd);

            // Fallback: MinecraftService.sendCommand (birincil sunucu için)
            if (!sent && !serverId) {
                try { minecraftService.sendCommand(cmd); } catch { /* ignore */ }
            } else if (!sent) {
                try {
                    const { serverManager } = require('./serverManager');
                    const inst = serverManager._instances?.get(parseInt(serverId));
                    if (inst) inst.sendCommand(cmd);
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }
    });

    // 8) Temizlik
    ws.on('close', () => {
        clearInterval(statusInterval);
        if (tailProc) { try { tailProc.kill(); } catch { /* */ } }
        try {
            if (!serverId) {
                minecraftService.off('crash', crashHandler);
            } else {
                const { serverManager } = require('./serverManager');
                const id = parseInt(serverId);
                const inst = serverManager._instances?.get(id);
                if (inst) inst.off('crash', crashHandler);
            }
        } catch { /* ignore */ }
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
        const urlObj   = new URL(req.url, `http://${req.headers.host}`);
        const pathname = urlObj.pathname;

        if (pathname !== '/ws/console' && pathname !== '/ws/terminal') {
            socket.destroy(); return;
        }

        const user = verifyToken(req);
        if (!user) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy(); return;
        }

        const serverId = urlObj.searchParams.get('serverId') || null;

        wss.handleUpgrade(req, socket, head, (ws) => {
            if (pathname === '/ws/console') handleConsole(ws, serverId);
            else handleTerminal(ws);
        });
    });
}

module.exports = { setupWebSockets };
