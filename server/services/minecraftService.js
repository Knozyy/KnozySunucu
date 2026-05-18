const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { getDb } = require('../db/database');

// ── Screen ayarları ───────────────────────────────────────────────────────────
const SCREEN_NAME = process.env.MINECRAFT_SCREEN_NAME || 'knozy-mc';
const LOG_FILE   = '/tmp/knozy-mc.log';

class MinecraftService extends EventEmitter {
    constructor() {
        super();
        this._tailProcess = null;   // tail -f process (log okuma)
        this._javaPid     = null;   // gerçek Java PID
        this.process      = null;   // Windows compat. (eski API) — Linux'ta null
        this.status       = 'stopped';
        this.players      = [];
        this.logs         = [];
        this.maxLogLines  = 500;
        this.processStats = { cpuPercent: 0, memoryMB: 0 };
        this._lastTps = { one: null, five: null, fifteen: null };
        this._tpsInterval        = null;
        this._statsInterval      = null;
        this._statusCheckInterval = null;
        // Çöküm takibi
        this._crashCount       = 0;
        this._crashWindowStart = 0;
        // Panel kapanıyor mu? (bu flag true iken MC'ye dokunulmamalı)
        this._shuttingDown = false;

        // Panel yeniden başlarsa çalışan sunucuya yeniden bağlan
        if (this._useScreen()) {
            setTimeout(() => this._reconnectIfRunning(), 500);
        }

        // Panel kapanırken MC screen'ini ÖLDÜRME — sadece interval/tail temizle
        const _gracefulShutdown = () => {
            this._shuttingDown = true;
            this._stopStatusWatch();
            this._stopStatsTracking();
            this._stopLogTail();
            // Kasıtlı olarak screen veya Java'ya dokunmuyoruz
            process.exit(0);
        };
        process.once('SIGTERM', _gracefulShutdown);
        process.once('SIGINT',  _gracefulShutdown);
    }

    // ── Platform yardımcıları ─────────────────────────────────────────────────

    /** Linux'ta screen kullanılacak mı? */
    _useScreen() {
        if (process.platform === 'win32') return false;
        try { execSync('which screen', { stdio: 'ignore' }); return true; } catch { return false; }
    }

    _isScreenRunning() {
        try {
            const out = execSync(`screen -ls 2>/dev/null || true`, { encoding: 'utf8' });
            return out.includes(SCREEN_NAME);
        } catch { return false; }
    }

    _findJavaPid() {
        try {
            const serverPath = this.getServerPath();
            // Önce sunucu yoluna göre ara
            let result = execSync(`pgrep -f "${serverPath}" 2>/dev/null || true`, { encoding: 'utf8' }).trim();
            if (!result) {
                // Fallback: genel java server arama
                result = execSync(`pgrep -f "java.*nogui" 2>/dev/null || true`, { encoding: 'utf8' }).trim();
            }
            const pids = result.split('\n').filter(Boolean).map(Number);
            return pids.length > 0 ? pids[0] : null;
        } catch { return null; }
    }

    // ── Panel restart sonrası yeniden bağlanma ────────────────────────────────

    _reconnectIfRunning() {
        try {
            if (!this._isScreenRunning()) return;
            const javaPid = this._findJavaPid();
            if (!javaPid) return;

            this._javaPid = javaPid;
            this.status   = 'running';
            this.addLog('[System] ✅ Panel yeniden başlatıldı — çalışan sunucu tespit edildi, yeniden bağlanıldı.');
            this.emit('log', '[System] ✅ Panel yeniden başlatıldı — çalışan sunucu tespit edildi.');
            this.emit('status', this.status);
            this._startLogTail(true /* tail mevcut dosyanın sonundan */);
            this._startStatsTracking();
            this._startStatusWatch();
        } catch (err) {
            this.addLog(`[System] Reconnect hatası: ${err.message}`);
        }
    }

    // ── Log tail (Linux/screen modu) ──────────────────────────────────────────

    _startLogTail(fromEnd = false) {
        this._stopLogTail();

        // Log dosyası yoksa oluştur
        if (!fs.existsSync(LOG_FILE)) {
            try { fs.writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }
        }

        // -n 0: sadece yeni satırları oku (reconnect için) | -n +1: baştan oku
        const nArg = fromEnd ? '0' : '+1';
        this._tailProcess = spawn('tail', [`-n`, nArg, '-f', LOG_FILE], {
            stdio: ['ignore', 'pipe', 'ignore'],
        });

        let buffer = '';
        this._tailProcess.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // tamamlanmamış satır
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                this.addLog(line);
                this.emit('log', line);
                this._parseLine(line);
            }
        });

        this._tailProcess.on('close', () => { this._tailProcess = null; });
    }

    _stopLogTail() {
        if (this._tailProcess) {
            try { this._tailProcess.kill(); } catch { /* ignore */ }
            this._tailProcess = null;
        }
    }

    // ── Satır analizi (her iki modda ortak) ──────────────────────────────────

    _parseLine(line) {
        const lower = line.toLowerCase();

        // Başarılı başlatma
        if ((line.includes('Done (') && line.includes(')!')) ||
            lower.includes('server started') ||
            lower.includes('started in ') ||
            lower.includes('thread/info]: done')) {
            if (this.status !== 'running') {
                this.status = 'running';
                this.emit('status', this.status);
                if (this._useScreen()) this._javaPid = this._findJavaPid();
            }
        }

        // Otomatik onaylar
        if (lower.includes("type 'i agree'")) {
            this.addLog("[System] Otomatik kurulum onayı gönderildi.");
            this.sendCommand('I agree');
        }
        if (lower.includes("eula=true") || lower.includes("accept the eula")) {
            this.addLog("[System] Otomatik EULA onayı gönderildi.");
            this.sendCommand('true');
            this.sendCommand('I agree');
        }

        // TPS (Paper/Spigot: "TPS from last 1m, 5m, 15m: X.XX, X.XX, X.XX")
        const tpsMatch = line.match(/TPS from last 1m,\s*5m,\s*15m:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
        if (tpsMatch) {
            this._lastTps = {
                one: parseFloat(tpsMatch[1]),
                five: parseFloat(tpsMatch[2]),
                fifteen: parseFloat(tpsMatch[3]),
            };
        }

        // Oyuncu giriş/çıkış
        const joinMatch = line.match(/(\w+) joined the game/);
        if (joinMatch && !this.players.includes(joinMatch[1])) {
            this.players.push(joinMatch[1]);
            this.emit('players', this.players);
            try {
                const db = getDb();
                db.prepare('INSERT INTO player_sessions (username, joined_at) VALUES (?, ?)').run(joinMatch[1], Date.now());
            } catch { /* ignore */ }
        }
        const leaveMatch = line.match(/(\w+) left the game/);
        if (leaveMatch) {
            this.players = this.players.filter(p => p !== leaveMatch[1]);
            this.emit('players', this.players);
            try {
                const db = getDb();
                const open = db.prepare('SELECT id, joined_at FROM player_sessions WHERE username = ? AND left_at IS NULL ORDER BY id DESC LIMIT 1').get(leaveMatch[1]);
                if (open) {
                    const now = Date.now();
                    db.prepare('UPDATE player_sessions SET left_at = ?, duration_seconds = ? WHERE id = ?')
                        .run(now, Math.round((now - open.joined_at) / 1000), open.id);
                }
            } catch { /* ignore */ }
        }
    }

    // ── Java process izleyici (screen modu) ──────────────────────────────────

    _startStatusWatch() {
        this._stopStatusWatch();
        this._statusCheckInterval = setInterval(() => {
            // Panel kapanıyorsa hiçbir şey yapma
            if (this._shuttingDown) { this._stopStatusWatch(); return; }

            if (this.status === 'stopped') {
                this._stopStatusWatch();
                return;
            }
            const javaPid = this._findJavaPid();
            if (!javaPid && (this.status === 'running' || this.status === 'starting')) {
                this._onServerExited();
            } else if (javaPid) {
                this._javaPid = javaPid;
            }
        }, 5000);
    }

    _stopStatusWatch() {
        if (this._statusCheckInterval) {
            clearInterval(this._statusCheckInterval);
            this._statusCheckInterval = null;
        }
    }

    _onServerExited() {
        const wasRunning  = this.status === 'running' || this.status === 'starting';
        const wasStopping = this.status === 'stopping';

        this.status       = 'stopped';
        this.players      = [];
        this._javaPid     = null;
        this.processStats = { cpuPercent: 0, memoryMB: 0 };
        this._lastTps     = { one: null, five: null, fifteen: null };

        // Sunucu kapanınca açık oturumları kapat
        try {
            const db = getDb();
            const now = Date.now();
            const open = db.prepare('SELECT id, joined_at FROM player_sessions WHERE left_at IS NULL').all();
            const stmt = db.prepare('UPDATE player_sessions SET left_at = ?, duration_seconds = ? WHERE id = ?');
            for (const s of open) stmt.run(now, Math.round((now - s.joined_at) / 1000), s.id);
        } catch { /* ignore */ }

        this._stopStatsTracking();
        this._stopStatusWatch();
        this._stopLogTail();

        this.emit('status', this.status);
        this.emit('log', '[System] Sunucu kapandı.');

        if (wasRunning && !wasStopping) {
            this._handleCrash(-1);
        }
    }

    /** Çöküm tespiti ve oto-başlatma — her iki platformdan çağrılır */
    _handleCrash(exitCode) {
        const now = Date.now();
        if (now - this._crashWindowStart > 300000) {
            this._crashCount = 0;
            this._crashWindowStart = now;
        }
        this._crashCount = (this._crashCount || 0) + 1;

        let autoRestartEnabled = true;
        try {
            const db = getDb();
            const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_restart_enabled'").get();
            autoRestartEnabled = !setting || setting.value === '1';
            db.prepare('INSERT INTO crash_events (exit_code, auto_restarted, crash_count) VALUES (?, ?, ?)')
                .run(exitCode ?? -1, autoRestartEnabled ? 1 : 0, this._crashCount);
        } catch { /* ignore */ }

        // Panel kapanıyorsa otomatik yeniden başlatma yapma
        if (this._shuttingDown) return;

        const MAX_CRASHES = 5;
        if (this._crashCount >= MAX_CRASHES) {
            this.addLog(`[System] 🔴 Son 5 dakikada ${this._crashCount} çöküm! Otomatik başlatma durduruldu.`);
            this.emit('log', `[System] 🔴 Çok fazla çöküm (${this._crashCount}x). Otomatik başlatma durduruldu.`);
            this.emit('crash', { code: exitCode, timestamp: now, autoRestarted: false, crashCount: this._crashCount, reason: 'max_crashes' });
            return;
        }

        this.addLog(`[System] ⚠️ Sunucu çöktü (exit code: ${exitCode}, çöküm #${this._crashCount})`);
        this.emit('crash', { code: exitCode, timestamp: now, autoRestarted: autoRestartEnabled, crashCount: this._crashCount });

        try {
            const notificationService = require('./notificationService');
            notificationService.send('server_crash', `Sunucu çöktü (exit code: ${exitCode}). ${autoRestartEnabled ? 'Otomatik yeniden başlatma yapılıyor...' : 'Otomatik başlatma kapalı.'}`);
        } catch { /* ignore */ }

        if (autoRestartEnabled) {
            this.addLog('[System] 🔄 10 saniye sonra otomatik yeniden başlatılıyor...');
            this.emit('log', '[System] 🔄 Otomatik yeniden başlatma 10sn içinde...');
            setTimeout(() => {
                if (this.status === 'stopped') {
                    try { this.start(); }
                    catch (err) { this.addLog(`[System] Otomatik başlatma başarısız: ${err.message}`); }
                }
            }, 10000);
        } else {
            this.emit('log', '[System] ⚠️ Otomatik başlatma kapalı, manuel başlatma gerekiyor.');
        }
    }

    // ── Temel metodlar ───────────────────────────────────────────────────────

    getServerPath() {
        try {
            const db = getDb();
            const active = db.prepare('SELECT install_path FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
            if (active?.install_path && fs.existsSync(active.install_path)) return active.install_path;
        } catch { /* fallback */ }
        return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    getActiveProfile() {
        try {
            const db = getDb();
            return db.prepare('SELECT * FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get() || null;
        } catch { return null; }
    }

    async switchProfile(profileId) {
        const db = getDb();
        const target = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(profileId);
        if (!target) throw new Error('Profil bulunamadı');

        if (this.status === 'running' || this.process || this._javaPid) {
            this.addLog('[Profil] Sunucu kapatılıyor (save-all)...');
            try { this.sendCommand('save-all'); } catch { /* ignore */ }
            await new Promise(r => setTimeout(r, 3000));
            try { this.sendCommand('stop'); } catch { /* ignore */ }
            await new Promise((resolve) => {
                const check = setInterval(() => {
                    if (this.status === 'stopped') { clearInterval(check); resolve(); }
                }, 500);
                setTimeout(() => {
                    clearInterval(check);
                    this._forceKill();
                    setTimeout(resolve, 2000);
                }, 15000);
            });
        }

        db.prepare('UPDATE installed_modpacks SET is_active = 0').run();
        db.prepare('UPDATE installed_modpacks SET is_active = 1 WHERE id = ?').run(profileId);

        if (target.server_port && target.install_path) {
            const propsPath = path.join(target.install_path, 'server.properties');
            if (fs.existsSync(propsPath)) {
                let content = fs.readFileSync(propsPath, 'utf-8');
                content = content.replace(/^server-port=.*/m, `server-port=${target.server_port}`);
                fs.writeFileSync(propsPath, content, 'utf-8');
                this.addLog(`[Profil] Port ayarlandı: ${target.server_port}`);
            }
        }

        this.addLog(`[Profil] "${target.name}" profili aktif edildi`);
        return { message: `"${target.name}" profili aktif edildi`, profile: target };
    }

    getServerJar() {
        return process.env.MINECRAFT_SERVER_JAR || 'forge-server.jar';
    }

    getStatus() {
        return {
            status: this.status,
            players: this.players,
            playerCount: this.players.length,
            pid: this._javaPid || (this.process ? this.process.pid : null),
            processStats: this.processStats,
        };
    }

    // ── start() ──────────────────────────────────────────────────────────────

    start() {
        if (this.status === 'running' || this.status === 'starting') {
            throw new Error('Sunucu zaten çalışıyor');
        }

        const serverPath = this.getServerPath();
        this._acceptEula(serverPath);

        const scriptInfo = this._detectStartScript(serverPath);
        const cwd = (scriptInfo && scriptInfo.cwd) || serverPath;

        if (this._useScreen()) {
            // ── Linux: screen içinde başlat ──────────────────────────────
            let runCmd;
            if (scriptInfo) {
                const ext = path.extname(scriptInfo.script).toLowerCase();
                try { execSync(`chmod +x "${scriptInfo.scriptPath}"`, { stdio: 'ignore' }); } catch { /* ignore */ }
                runCmd = ext === '.bat'
                    ? `bash "${scriptInfo.scriptPath}"`
                    : `bash "${scriptInfo.scriptPath}"`;
            } else {
                const db = getDb();
                const pack = db.prepare("SELECT min_ram, max_ram, jvm_args FROM installed_modpacks WHERE is_active = 1").get();
                const maxRam = (pack && pack.max_ram) || process.env.MINECRAFT_MAX_RAM || '4G';
                const minRam = (pack && pack.min_ram) || process.env.MINECRAFT_MIN_RAM || '2G';
                const jvmArgs = (pack && pack.jvm_args) || process.env.JVM_ARGS || '';
                const jvmStr = jvmArgs || `-Xmx${maxRam} -Xms${minRam}`;
                runCmd = `java ${jvmStr} -jar server.jar nogui`;
            }

            // Log dosyasını temizle
            try { fs.writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }

            // Eski screen'i temizle — ama SADECE içinde Java yoksa.
            // Eğer Java çalışıyorsa paneli yeniden başlatmak sunucuyu öldürmesin.
            if (this._isScreenRunning()) {
                const existingPid = this._findJavaPid();
                if (existingPid) {
                    // Sunucu hâlâ çalışıyor; durumu düzelt ve başlatmayı iptal et
                    this._javaPid = existingPid;
                    this.status   = 'running';
                    this.emit('status', this.status);
                    this._startLogTail(true);
                    this._startStatsTracking();
                    this._startStatusWatch();
                    throw new Error('Sunucu zaten çalışıyor (screen + java mevcut)');
                }
                // Screen var ama Java yok — ölü screen oturumunu temizle
                try { execSync(`screen -S ${SCREEN_NAME} -X quit 2>/dev/null; true`, { stdio: 'ignore' }); } catch { /* ignore */ }
                try { execSync('sleep 0.3', { stdio: 'ignore' }); } catch { /* ignore */ }
            }

            // Screen başlat — çıktıyı log dosyasına yönlendir
            const fullCmd = `cd '${cwd}' && { ${runCmd}; } 2>&1 | tee '${LOG_FILE}'`;
            execSync(`screen -dmS ${SCREEN_NAME} bash -c ${JSON.stringify(fullCmd)}`, { stdio: 'ignore' });

            this.addLog(`[System] Sunucu başlatılıyor (screen: ${SCREEN_NAME})`);
            this.status = 'starting';
            this.emit('status', this.status);

            // Log tail'i biraz bekleyerek başlat (screen başlasın)
            setTimeout(() => this._startLogTail(false), 1200);
            this._startStatsTracking();
            this._startStatusWatch();

        } else {
            // ── Windows: doğrudan spawn (eski yöntem) ───────────────────
            let cmd, args;
            if (scriptInfo) {
                const ext = path.extname(scriptInfo.script).toLowerCase();
                if (ext === '.bat') { cmd = 'cmd'; args = ['/c', scriptInfo.scriptPath]; }
                else if (ext === '.ps1') { cmd = 'powershell'; args = ['-ExecutionPolicy', 'Bypass', '-File', scriptInfo.scriptPath]; }
                else { try { fs.chmodSync(scriptInfo.scriptPath, '755'); } catch { /* ignore */ } cmd = 'bash'; args = [scriptInfo.scriptPath]; }
                this.addLog(`[System] Script ile başlatılıyor: ${scriptInfo.script}`);
            } else {
                const db = getDb();
                const pack = db.prepare("SELECT min_ram, max_ram, jvm_args FROM installed_modpacks WHERE is_active = 1").get();
                const maxRam = (pack && pack.max_ram) || process.env.MINECRAFT_MAX_RAM || '4G';
                const minRam = (pack && pack.min_ram) || process.env.MINECRAFT_MIN_RAM || '2G';
                const jvmArgs = (pack && pack.jvm_args) || process.env.JVM_ARGS || '';
                cmd = 'java'; args = [];
                if (jvmArgs) { args.push(...jvmArgs.split(' ').filter(a => a)); }
                else { args.push(`-Xmx${maxRam}`, `-Xms${minRam}`); }
                args.push('-jar', this.getServerJar(), 'nogui');
            }

            this.process = spawn(cmd, args, {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this.status = 'starting';
            this.emit('status', this.status);
            this._startStatsTracking();

            let stdoutBuf = '', stderrBuf = '';
            this.process.stdout.on('data', (data) => {
                stdoutBuf += data.toString();
                const lines = stdoutBuf.split('\n'); stdoutBuf = lines.pop();
                for (let line of lines) {
                    line = line.trim(); if (!line) continue;
                    this.addLog(line); this.emit('log', line); this._parseLine(line);
                }
            });
            this.process.stderr.on('data', (data) => {
                stderrBuf += data.toString();
                const lines = stderrBuf.split('\n'); stderrBuf = lines.pop();
                for (let line of lines) {
                    line = line.trim(); if (!line) continue;
                    this.addLog(`[STDERR] ${line}`); this.emit('log', `[STDERR] ${line}`);
                }
            });
            this.process.on('close', (code) => {
                const wasRunning  = this.status === 'running' || this.status === 'starting';
                const wasStopping = this.status === 'stopping';
                this.status = 'stopped';
                this.players = [];
                this.process = null;
                this.processStats = { cpuPercent: 0, memoryMB: 0 };
                this._stopStatsTracking();
                this.emit('status', this.status);
                this.emit('log', `[System] Sunucu kapandı (exit code: ${code})`);
                // Crash: çalışırken beklenmedik kapanma
                if (wasRunning && !wasStopping && code !== 0) {
                    this._handleCrash(code);
                }
            });
            this.process.on('error', (err) => {
                this.status = 'error'; this.emit('status', this.status);
                this.emit('log', `[Error] ${err.message}`);
            });
        }
    }

    // ── stop() ───────────────────────────────────────────────────────────────

    stop() {
        if (this.status === 'stopped') throw new Error('Sunucu zaten durmuş');

        this.status = 'stopping';
        this.emit('status', this.status);
        this.addLog('[System] Sunucu kapatılıyor...');

        try { this.sendCommand('stop'); } catch { /* ignore */ }

        // 15sn sonra zorla kapat
        setTimeout(() => {
            if (this.status === 'stopping') {
                this.addLog('[System] Graceful shutdown yanıt vermedi, zorla kapatılıyor...');
                this._forceKill();
            }
        }, 15000);
    }

    _forceKill() {
        if (this._useScreen()) {
            try { execSync(`screen -S ${SCREEN_NAME} -X quit 2>/dev/null; true`, { stdio: 'ignore' }); } catch { /* ignore */ }
            if (this._javaPid) {
                try { process.kill(this._javaPid, 'SIGKILL'); } catch { /* ignore */ }
            }
        } else {
            this._killProcessTree(this.process?.pid);
        }
        // Durumu temizle
        this._onServerExited && setTimeout(() => {
            if (this.status === 'stopping') this._onServerExited();
        }, 1000);
    }

    _killProcessTree(pid) {
        if (!pid) return;
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            } else {
                try { process.kill(-pid, 'SIGKILL'); } catch {
                    try { execSync(`pkill -KILL -P ${pid}`, { stdio: 'ignore' }); } catch { /* ignore */ }
                    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
                }
            }
            this.addLog('[System] Process sonlandırıldı');
        } catch (err) {
            this.addLog(`[System] Kill hatası: ${err.message}`);
        }
    }

    // ── restart() ────────────────────────────────────────────────────────────

    restart() {
        return new Promise((resolve, reject) => {
            if (this.status === 'stopped') {
                try { this.start(); resolve(); } catch (err) { reject(err); }
                return;
            }
            this.once('status', (status) => {
                if (status === 'stopped') {
                    setTimeout(() => {
                        try { this.start(); resolve(); } catch (err) { reject(err); }
                    }, 2000);
                }
            });
            this.stop();
        });
    }

    // ── sendCommand() ─────────────────────────────────────────────────────────

    sendCommand(command) {
        const isActive = this.status === 'running' || this.status === 'starting' || this.status === 'stopping';
        if (!isActive) throw new Error('Sunucu çalışmıyor');

        this.addLog(`> ${command}`);
        this.emit('log', `> ${command}`);

        if (this._useScreen()) {
            const escaped = command.replace(/'/g, "'\\''");
            execSync(`screen -S ${SCREEN_NAME} -X stuff '${escaped}\r'`, { timeout: 3000 });
        } else {
            if (this.process?.stdin) {
                this.process.stdin.write(command + '\n');
            }
        }
    }

    // ── Stats takibi ─────────────────────────────────────────────────────────

    _startStatsTracking() {
        this._stopStatsTracking();
        const systemService = require('./systemService');

        this._statsInterval = setInterval(async () => {
            try {
                const pid = this._javaPid || this.process?.pid;
                if (!pid) return;
                const processes = await systemService.getProcesses();
                const matched = processes.find(p => p.pid === pid);
                if (matched) {
                    this.processStats.cpuPercent = +(matched.treeCpu).toFixed(1);
                    this.processStats.memoryMB   = Math.round(matched.treeMem);
                }
            } catch { /* ignore */ }
        }, 5000);

        // TPS komutunu 30sn'de bir gönder (Paper/Spigot sunucular için)
        this._tpsInterval = setInterval(() => {
            if (this.status === 'running') {
                try { this.sendCommand('tps'); } catch { /* sunucu tps komutunu desteklemeyebilir */ }
            }
        }, 30000);
    }

    _stopStatsTracking() {
        if (this._statsInterval) { clearInterval(this._statsInterval); this._statsInterval = null; }
        if (this._tpsInterval)   { clearInterval(this._tpsInterval);   this._tpsInterval = null; }
    }

    // ── Yardımcı metodlar ─────────────────────────────────────────────────────

    _detectStartScript(serverPath) {
        const scriptPriority = process.platform === 'win32'
            ? ['run.bat', 'start.bat', 'startserver.bat', 'ServerStart.bat', 'run.ps1', 'start.ps1']
            : ['run.sh', 'startserver.sh', 'ServerStart.sh', 'start.sh'];

        for (const script of scriptPriority) {
            const scriptPath = path.join(serverPath, script);
            if (fs.existsSync(scriptPath)) return { scriptPath, script };
        }
        try {
            const dirs = fs.readdirSync(serverPath).filter(d => {
                const full = path.join(serverPath, d);
                return fs.statSync(full).isDirectory() && !d.startsWith('.');
            });
            for (const dir of dirs) {
                const subDir = path.join(serverPath, dir);
                for (const script of scriptPriority) {
                    const scriptPath = path.join(subDir, script);
                    if (fs.existsSync(scriptPath)) return { scriptPath, script, cwd: subDir };
                }
            }
        } catch { /* ignore */ }
        return null;
    }

    detectModLoader(serverPath) {
        const sPath = serverPath || this.getServerPath();
        try {
            const jars = fs.readdirSync(sPath).filter(f => f.endsWith('.jar'));
            for (const jar of jars) {
                const name = jar.toLowerCase();
                if (name.includes('neoforge')) return 'neoforge';
                if (name.includes('forge') && !name.includes('installer')) return 'forge';
                if (name.includes('fabric')) return 'fabric';
                if (name.includes('quilt')) return 'quilt';
            }
        } catch { /* ignore */ }
        return 'forge';
    }

    detectMinecraftVersion(serverPath) {
        const sPath = serverPath || this.getServerPath();
        const versionFile = path.join(sPath, 'version.json');
        if (fs.existsSync(versionFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
                const ver = (data.id || '').split('-')[0];
                if (ver) return ver;
            } catch { /* ignore */ }
        }
        try {
            const jars = fs.readdirSync(sPath).filter(f => f.endsWith('.jar'));
            for (const jar of jars) {
                const match = jar.match(/(\d+\.\d+\.?\d*)/);
                if (match) return match[1];
            }
        } catch { /* ignore */ }
        return '1.20.1';
    }

    repair() {
        if (this.status !== 'stopped') throw new Error('Onarım için sunucu durdurulmalı');
        const serverPath = this.getServerPath();
        const targets = ['libraries', 'versions', 'installer.log', 'installer.log.1'];
        const deleted = [];
        const searchDirs = [serverPath];
        try {
            const dirs = fs.readdirSync(serverPath).filter(d => {
                const full = path.join(serverPath, d);
                return fs.statSync(full).isDirectory() && !d.startsWith('.');
            });
            searchDirs.push(...dirs.map(d => path.join(serverPath, d)));
        } catch { /* ignore */ }
        for (const dir of searchDirs) {
            for (const target of targets) {
                const p = path.join(dir, target);
                try {
                    if (fs.existsSync(p)) {
                        const stat = fs.statSync(p);
                        if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
                        else fs.unlinkSync(p);
                        deleted.push(target);
                    }
                } catch { /* ignore */ }
            }
        }
        if (deleted.length === 0) return { message: 'Onarılacak dosya bulunamadı.' };
        return { message: `Temizlenen dosyalar: ${deleted.join(', ')}. Sunucuyu tekrar başlatın.` };
    }

    _acceptEula(serverPath) {
        const eulaPath = path.join(serverPath, 'eula.txt');
        try { fs.writeFileSync(eulaPath, 'eula=true\n'); } catch { /* ignore */ }
        try {
            const dirs = fs.readdirSync(serverPath).filter(d => {
                const full = path.join(serverPath, d);
                return fs.statSync(full).isDirectory() && !d.startsWith('.');
            });
            for (const dir of dirs) {
                const sub = path.join(serverPath, dir);
                const hasMods = fs.existsSync(path.join(sub, 'mods'));
                const hasScript = ['run.sh', 'startserver.sh', 'start.sh'].some(s => fs.existsSync(path.join(sub, s)));
                if (hasMods || hasScript) fs.writeFileSync(path.join(sub, 'eula.txt'), 'eula=true\n');
            }
        } catch { /* ignore */ }
    }

    addLog(line) {
        this.logs.push({ time: new Date().toISOString(), message: line });
        if (this.logs.length > this.maxLogLines) this.logs = this.logs.slice(-this.maxLogLines);
    }

    getRecentLogs(count = 100) { return this.logs.slice(-count); }

    getProperties() {
        const propsPath = path.join(this.getServerPath(), 'server.properties');
        if (!fs.existsSync(propsPath)) return {};
        const content = fs.readFileSync(propsPath, 'utf-8');
        const properties = {};
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return;
            properties[trimmed.substring(0, eqIndex).trim()] = trimmed.substring(eqIndex + 1).trim();
        });
        return properties;
    }

    setProperties(newProps) {
        const propsPath = path.join(this.getServerPath(), 'server.properties');
        if (!fs.existsSync(propsPath)) throw new Error('server.properties bulunamadı');
        const content = fs.readFileSync(propsPath, 'utf-8');
        const lines = content.split('\n');
        const updated = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return line;
            const key = trimmed.substring(0, eqIndex).trim();
            if (key in newProps) return `${key}=${newProps[key]}`;
            return line;
        });
        fs.writeFileSync(propsPath, updated.join('\n'), 'utf-8');
    }
}

module.exports = new MinecraftService();
