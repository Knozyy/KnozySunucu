const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');

let pty;
try {
    pty = require('node-pty');
} catch {
    pty = null;
    console.warn('[Terminal] node-pty yüklenemedi — terminal devre dışı');
}

/**
 * Session tabanlı terminal yönetimi
 * Her WebSocket bağlantısı kendi izole PTY'sine (bash) sahiptir.
 * Sekmeler / sayfalar birbirini etkilemez.
 */
class TerminalService {
    constructor() {
        this.sessions = new Map(); // sessionId → { pty, ws, buffer }
    }

    isAvailable() { return !!pty; }

    /**
     * Yeni izole PTY oturumu oluştur ve bir WebSocket'e bağla.
     * @returns {string|null} sessionId veya pty yoksa null
     */
    createSession(ws) {
        if (!pty) {
            try {
                ws.send(JSON.stringify({
                    type: 'output',
                    data: '\r\n\x1b[31mTerminal kullanılamıyor: node-pty yüklü değil.\x1b[0m\r\n',
                }));
            } catch { /* ignore */ }
            return null;
        }

        const sessionId = crypto.randomBytes(8).toString('hex');
        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

        let ptyProcess;
        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd: os.homedir(),
                env: { ...process.env, TERM: 'xterm-256color' },
            });
        } catch (err) {
            console.error('[Terminal] PTY başlatılamadı:', err.message);
            try {
                ws.send(JSON.stringify({
                    type: 'output',
                    data: `\r\n\x1b[31mPTY başlatılamadı: ${err.message}\x1b[0m\r\n`,
                }));
            } catch { /* ignore */ }
            return null;
        }

        const session = {
            id: sessionId,
            pty: ptyProcess,
            ws,
            buffer: [],
            disposed: false,
        };

        ptyProcess.onData(data => {
            if (session.disposed) return;
            // Yalnızca son ekran replay'i için küçük bir buffer tut
            session.buffer.push(data);
            if (session.buffer.length > 500) session.buffer.shift();
            if (session.ws.readyState === 1) {
                try { session.ws.send(JSON.stringify({ type: 'output', data })); } catch { /* */ }
            }
        });

        ptyProcess.onExit(() => {
            if (session.disposed) return;
            session.disposed = true;
            if (session.ws.readyState === 1) {
                try {
                    session.ws.send(JSON.stringify({
                        type: 'output',
                        data: '\r\n\x1b[33m[oturum sonlandı]\x1b[0m\r\n',
                    }));
                } catch { /* */ }
            }
            this.sessions.delete(sessionId);
        });

        this.sessions.set(sessionId, session);
        return sessionId;
    }

    /**
     * Oturumu kapat — PTY'yi öldür, listeden sil
     */
    destroySession(sessionId) {
        const s = this.sessions.get(sessionId);
        if (!s) return;
        s.disposed = true;
        try { s.pty.kill(); } catch { /* ignore */ }
        this.sessions.delete(sessionId);
    }

    write(sessionId, data) {
        const s = this.sessions.get(sessionId);
        if (s && !s.disposed) {
            try { s.pty.write(data); } catch { /* ignore */ }
        }
    }

    resize(sessionId, cols, rows) {
        const s = this.sessions.get(sessionId);
        if (s && !s.disposed) {
            try { s.pty.resize(Math.max(cols, 10), Math.max(rows, 5)); } catch { /* ignore */ }
        }
    }

    /**
     * Belirli oturumun PTY'sine "screen -D -r <name>" yaz → o oturumdan screen'e attach.
     * Sadece o sekmeyi etkiler, diğer sekmeleri etkilemez.
     */
    attachScreenInSession(sessionId, name) {
        const s = this.sessions.get(sessionId);
        if (s && !s.disposed) {
            try { s.pty.write(`screen -D -r ${name}\r`); } catch { /* ignore */ }
        }
    }

    /**
     * Belirli oturumun PTY'sinde komut çalıştır (FTB / modpack kurulum için)
     */
    runInSession(sessionId, command) {
        const s = this.sessions.get(sessionId);
        if (s && !s.disposed) {
            try { s.pty.write(`${command}\r`); } catch { /* ignore */ }
        }
    }

    // ─── Screen yönetimi (filesystem seviyesi — oturumdan bağımsız) ───────────

    listScreens() {
        try {
            const out = execSync('screen -ls 2>&1', { timeout: 3000 }).toString();
            const screens = [];
            for (const line of out.split('\n')) {
                const match = line.match(/^\s+(\d+)\.(\S+)\s+\(([^)]+)\)\s+\(([^)]+)\)/);
                if (match) {
                    screens.push({
                        fullId: `${match[1]}.${match[2]}`,
                        pid: match[1],
                        name: match[2],
                        created: match[3],
                        status: match[4],
                    });
                }
            }
            return screens;
        } catch {
            return [];
        }
    }

    createScreen(name) {
        execSync(`screen -dmS ${name}`, { timeout: 5000 });
    }

    killScreen(name) {
        execSync(`screen -S ${name} -X quit 2>&1 || true`, { timeout: 5000 });
    }

    /**
     * Screen içindeki prosese doğrudan komut yaz (attach gerekmez)
     */
    sendToScreen(name, command) {
        const escaped = command.replace(/'/g, "'\\''");
        execSync(`screen -S ${name} -X stuff '${escaped}\r'`, { timeout: 5000 });
    }
}

module.exports = new TerminalService();
