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

// ─── Sunucu instance'ından gerçek screen/log yollarını çöz ────────────────
// Birincil singleton constructor'da `knozy-mc` (numarasız) olarak kilitleniyor;
// id'ye göre tahmin yürütmek yerine instance'ın kendi _screenName/_logFile'ını kullan.
function resolvePaths(serverId) {
    try {
        if (!serverId) {
            return {
                screenName: minecraftService._screenName || process.env.MINECRAFT_SCREEN_NAME || 'knozy-mc',
                logFile:    minecraftService._logFile    || '/tmp/knozy-mc.log',
            };
        }
        const id = parseInt(serverId);
        const { serverManager } = require('./serverManager');
        // Birincil mi?
        const primary = serverManager.getPrimary?.();
        if (primary && primary._serverConfig?.id === id) {
            return {
                screenName: primary._screenName || 'knozy-mc',
                logFile:    primary._logFile    || '/tmp/knozy-mc.log',
            };
        }
        // İkincil instance — yoksa oluştur
        const inst = serverManager.getInstance(id);
        if (inst) {
            return {
                screenName: inst._screenName || `knozy-mc${id}`,
                logFile:    inst._logFile    || `/tmp/knozy-mc${id}.log`,
            };
        }
    } catch { /* ignore */ }
    return {
        screenName: serverId ? `knozy-mc${serverId}` : 'knozy-mc',
        logFile:    serverId ? `/tmp/knozy-mc${serverId}.log` : '/tmp/knozy-mc.log',
    };
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
    const { screenName: screenNm, logFile } = resolvePaths(serverId);

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
// Her WebSocket bağlantısı kendi izole PTY oturumuna sahiptir.
// Sekmeler / sayfalar arası state karışması yok.
function handleTerminal(ws) {
    const sessionId = terminalService.createSession(ws);
    if (!sessionId) {
        // PTY açılamadı — bağlantıyı kapat
        try { ws.close(); } catch { /* */ }
        return;
    }

    // İstemciye session id'sini bildir (debug / log için)
    try { ws.send(JSON.stringify({ type: 'session', id: sessionId })); } catch { /* */ }

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            switch (parsed.type) {
                case 'input':
                    terminalService.write(sessionId, parsed.data);
                    break;
                case 'resize':
                    terminalService.resize(sessionId, parsed.cols, parsed.rows);
                    break;
                case 'attach':
                    // Bu oturumdan ilgili screen'e attach
                    if (parsed.name) terminalService.attachScreenInSession(sessionId, parsed.name);
                    break;
                case 'run':
                    if (parsed.command) terminalService.runInSession(sessionId, parsed.command);
                    break;
                default: /* yoksay */
            }
        } catch { /* ignore */ }
    });

    ws.on('close', () => terminalService.destroySession(sessionId));
    ws.on('error', () => terminalService.destroySession(sessionId));
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
