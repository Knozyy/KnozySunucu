const { execSync } = require('child_process');
const os = require('os');

let pty;
try {
    pty = require('node-pty');
} catch {
    pty = null;
    console.warn('[Terminal] node-pty yüklenemedi — terminal devre dışı');
}

/**
 * Tek PTY oturumu + screen yönetimi
 * Tüm WebSocket istemcileri aynı PTY'ye bağlanır
 */
class TerminalService {
    constructor() {
        this.ptyProcess = null;
        this.outputBuffer = [];
        this.clients = new Set();
        if (pty) this._spawn();
    }

    _spawn() {
        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
        try {
            this.ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: 220,
                rows: 50,
                cwd: os.homedir(),
                env: { ...process.env, TERM: 'xterm-256color' },
            });

            this.ptyProcess.onData(data => {
                this.outputBuffer.push(data);
                if (this.outputBuffer.length > 2000) this.outputBuffer.shift();
                for (const ws of this.clients) {
                    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data }));
                }
            });

            this.ptyProcess.onExit(() => {
                this.ptyProcess = null;
                setTimeout(() => {
                    if (pty) this._spawn();
                }, 1500);
            });
        } catch (err) {
            console.error('[Terminal] PTY başlatılamadı:', err.message);
        }
    }

    isAvailable() {
        return !!pty && !!this.ptyProcess;
    }

    addClient(ws) {
        this.clients.add(ws);
        if (!this.isAvailable()) {
            ws.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31mTerminal kullanılamıyor: node-pty yüklü değil.\x1b[0m\r\n' }));
            return;
        }
        // Son çıktıyı gönder (bağlantı yenilemede ekranı korur)
        const recent = this.outputBuffer.slice(-300).join('');
        if (recent) ws.send(JSON.stringify({ type: 'output', data: recent }));
    }

    removeClient(ws) {
        this.clients.delete(ws);
    }

    write(data) {
        if (this.ptyProcess) this.ptyProcess.write(data);
    }

    resize(cols, rows) {
        if (this.ptyProcess) {
            try { this.ptyProcess.resize(Math.max(cols, 10), Math.max(rows, 5)); } catch { /* ignore */ }
        }
    }

    // ─── Screen Yönetimi ──────────────────────────────────────────────────────

    listScreens() {
        try {
            const out = execSync('screen -ls 2>&1', { timeout: 3000 }).toString();
            const screens = [];
            for (const line of out.split('\n')) {
                // "	12345.minecraft	(05/17/2026 16:42:00)	(Detached)"
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

    attachScreen(name) {
        if (!pty) return;
        // Mevcut PTY'yi kapat, doğrudan o screen içinde yeni PTY aç
        // -D: diğer bağlı kullanıcıyı zorla çıkar, -r: reattach
        if (this.ptyProcess) {
            try { this.ptyProcess.kill(); } catch { /* ignore */ }
            this.ptyProcess = null;
        }
        this.outputBuffer = [];

        try {
            this.ptyProcess = pty.spawn('screen', ['-D', '-r', name], {
                name: 'xterm-256color',
                cols: 220,
                rows: 50,
                cwd: os.homedir(),
                env: { ...process.env, TERM: 'xterm-256color' },
            });

            this.ptyProcess.onData(data => {
                this.outputBuffer.push(data);
                if (this.outputBuffer.length > 2000) this.outputBuffer.shift();
                for (const ws of this.clients) {
                    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data }));
                }
            });

            this.ptyProcess.onExit(() => {
                this.ptyProcess = null;
                this.outputBuffer = [];
                // Screen'den çıkınca (Ctrl+A D) normal bash'e dön
                setTimeout(() => { if (pty) this._spawn(); }, 500);
            });
        } catch (err) {
            console.error('[Terminal] Screen attach hatası:', err.message);
            setTimeout(() => { if (pty) this._spawn(); }, 500);
        }
    }

    killScreen(name) {
        execSync(`screen -S ${name} -X quit 2>&1 || true`, { timeout: 5000 });
    }

    /**
     * Screen içindeki prosese doğrudan komut gönder (bağlı olmaya gerek yok)
     * screen -S <name> -X stuff "<komut>\r"
     */
    sendToScreen(name, command) {
        // Tek tırnak içindeki tek tırnakları escape et
        const escaped = command.replace(/'/g, "'\\''");
        execSync(`screen -S ${name} -X stuff '${escaped}\r'`, { timeout: 5000 });
    }

    runInTerminal(command) {
        if (this.ptyProcess) {
            this.ptyProcess.write(`${command}\r`);
        }
    }
}

module.exports = new TerminalService();
