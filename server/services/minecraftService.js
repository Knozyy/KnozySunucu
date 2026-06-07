const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { getDb } = require('../db/database');
const { cleanConsoleLine } = require('../utils/text');
const { parseLoginIp } = require('../utils/logParse');

class MinecraftService extends EventEmitter {
    /**
     * @param {Object} serverConfig - DB'deki `servers` kaydı (id zorunlu)
     * @param {number}  serverConfig.id
     * @param {string}  serverConfig.name
     * @param {string}  serverConfig.path
     * @param {string}  serverConfig.min_ram
     * @param {string}  serverConfig.max_ram
     * @param {string}  serverConfig.jvm_args
     *
     * SIGTERM/SIGINT yönetimi artık serverRegistry seviyesinde.
     */
    constructor(serverConfig) {
        super();
        if (!serverConfig || !serverConfig.id) {
            throw new Error('MinecraftService: serverConfig.id zorunlu (eşit sunucu mimarisi)');
        }
        this._serverConfig = serverConfig;
        this._screenName   = `knozy-mc${serverConfig.id}`;
        this._logFile      = `/tmp/knozy-mc${serverConfig.id}.log`;

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
            return out.includes(this._screenName);
        } catch { return false; }
    }

    _findJavaPid() {
        try {
            const serverPath = this.getServerPath();
            // Sunucu yoluna göre ara — her sunucu kendi path'inden tanınır
            const result = execSync(`pgrep -f "${serverPath}" 2>/dev/null || true`, { encoding: 'utf8' }).trim();
            const pids = result.split('\n').filter(Boolean).map(Number);
            return pids.length > 0 ? pids[0] : null;
        } catch { return null; }
    }

    /**
     * Çalışan sürecin GERÇEK başlangıç zamanını (ms epoch) OS'ten türetir.
     * Panel restart sonrası reconnect'te uptime'ın doğru olması için kullanılır
     * (panelin değil, sunucunun gerçek başlangıcı). `ps -o etimes` = saniye cinsi
     * geçen süre. Windows/başarısızlıkta null döner → çağıran Date.now()'a düşer.
     */
    _processStartedAt(pid) {
        if (!pid || process.platform === 'win32') return null;
        try {
            const out = execSync(`ps -o etimes= -p ${pid} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
            const sec = parseInt(out, 10);
            if (Number.isFinite(sec) && sec >= 0) return Date.now() - sec * 1000;
        } catch { /* ignore */ }
        return null;
    }

    // ── Panel restart sonrası yeniden bağlanma ────────────────────────────────

    _reconnectIfRunning() {
        try {
            if (!this._isScreenRunning()) return;
            const javaPid = this._findJavaPid();
            if (!javaPid) return;

            this._javaPid = javaPid;
            this.status   = 'running';
            // Uptime: panelin değil, çalışan Java sürecinin gerçek başlangıcı
            this._startedAt = this._processStartedAt(javaPid) || Date.now();
            this.addLog('[System] ✅ Panel yeniden başlatıldı — çalışan sunucu tespit edildi, yeniden bağlanıldı.');
            this.emit('log', '[System] ✅ Panel yeniden başlatıldı — çalışan sunucu tespit edildi.');
            this.emit('status', this.status);
            this._startLogTail(true /* tail mevcut dosyanın sonundan */);
            this._startStatsTracking();
            this._startStatusWatch();
            
            // Reconnect olduğunda oyuncu listesini senkronize et
            setTimeout(() => {
                try { this.sendCommand('list'); } catch {}
            }, 2000);
        } catch (err) {
            this.addLog(`[System] Reconnect hatası: ${err.message}`);
        }
    }

    // ── Log tail (Linux/screen modu) ──────────────────────────────────────────

    _startLogTail(fromEnd = false) {
        this._stopLogTail();

        // Log dosyası yoksa oluştur
        if (!fs.existsSync(this._logFile)) {
            try { fs.writeFileSync(this._logFile, ''); } catch { /* ignore */ }
        }

        // -n 0: sadece yeni satırları oku (reconnect için) | -n +1: baştan oku
        const nArg = fromEnd ? '0' : '+1';
        this._tailProcess = spawn('tail', [`-n`, nArg, '-f', this._logFile], {
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
        // ANSI/terminal kontrol kodlarını + screen prompt artıklarını temizle
        // (yoksa "[m> [K" gibi çöp regex'leri bozar ve konsola taşar)
        line = cleanConsoleLine(line);
        const lower = line.toLowerCase();

        // Başarılı başlatma
        if ((line.includes('Done (') && line.includes(')!')) ||
            lower.includes('server started') ||
            lower.includes('started in ') ||
            lower.includes('thread/info]: done')) {
            if (this.status !== 'running') {
                this.status = 'running';
                this._startedAt = Date.now();
                this.emit('status', this.status);
                if (this._useScreen()) this._javaPid = this._findJavaPid();
                // Yeni başlangıç → TPS komut tespitini sıfırla (modpack/loader değişmiş olabilir)
                this._resetTpsDetection();
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

        // ── TPS Parse (birden fazla format destekleniyor) ──
        // Paper/Spigot: "TPS from last 1m, 5m, 15m: X.XX, X.XX, X.XX"
        const tpsMatch = line.match(/TPS from last 1m,\s*5m,\s*15m:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
        if (tpsMatch) {
            this._lastTps = {
                one: parseFloat(tpsMatch[1]),
                five: parseFloat(tpsMatch[2]),
                fifteen: parseFloat(tpsMatch[3]),
            };
            // LagGuard event'i — gevşek bağlılık (lagGuard bu event'e abone olur)
            this.emit('tps', { tps: this._lastTps.one, mspt: null, source: 'paper', time: Date.now() });
            this._markTpsCmdWorking();
        }
        // Forge/NeoForge: "Overall : Mean tick time: XX.X ms. Mean TPS: XX.X"
        const forgeTpsMatch = line.match(/Overall\s*:?\s*Mean tick time:\s*([\d.]+)\s*ms\.?\s*Mean TPS:\s*([\d.]+)/i);
        if (forgeTpsMatch) {
            const forgeTps = parseFloat(forgeTpsMatch[2]);
            const forgeMspt = parseFloat(forgeTpsMatch[1]);
            this._lastTps = { one: forgeTps, five: forgeTps, fifteen: forgeTps };
            this._lastForgeMspt = forgeMspt;
            // LagGuard event'i
            this.emit('tps', { tps: forgeTps, mspt: forgeMspt, source: 'forge', time: Date.now() });
            this._markTpsCmdWorking();
        }
        // Vanilla 1.20.3+ /tick query: "Average time per tick: X ms" (mspt → tps türet)
        const tickQueryMatch = line.match(/Average (?:time per tick|tick time):\s*([\d.]+)\s*ms/i);
        if (tickQueryMatch) {
            const mspt = parseFloat(tickQueryMatch[1]);
            // Sunucu mspt ≤ 50 iken 20 TPS korur; üstünde TPS = 1000/mspt
            const tps = mspt <= 50 ? 20 : Math.round((1000 / mspt) * 10) / 10;
            this._lastTps = { one: tps, five: tps, fifteen: tps };
            this._lastForgeMspt = mspt;
            this.emit('tps', { tps, mspt, source: 'tickquery', time: Date.now() });
            this._markTpsCmdWorking();
        }
        // Forge tek boyut satırı: "Dim: minecraft:overworld ... Mean TPS: XX.X"
        // (bunları da kaydet ama _lastTps'yi sadece Overall yazar)

        // TPS komut tespiti: "Unknown or incomplete command" + "<cmd><--[HERE]"
        // satırından çalışmayan adayı öğren ve bir daha gönderme (konsol spam'ini durdurur)
        if (this._tpsCmdCandidates && line.includes('<--[HERE]')) {
            const hereMatch = line.match(/]:\s*(.+?)<--\[HERE\]/) || line.match(/^(.+?)<--\[HERE\]/);
            if (hereMatch) {
                const failed = hereMatch[1].trim().toLowerCase();
                for (const c of this._tpsCmdCandidates) {
                    if (c === failed || failed.startsWith(c) || c.startsWith(failed)) {
                        this._tpsCmdDisabled.add(c);
                        if (this._tpsCmdProbing === c) this._tpsCmdProbing = null;
                    }
                }
            }
        }

        // ── "Can't keep up" lag algılama ──
        const cantKeepUpMatch = line.match(/Can't keep up!.*Running\s+(\d+)ms/i);
        if (cantKeepUpMatch) {
            const behindMs = parseInt(cantKeepUpMatch[1]);
            this.emit('lag', { behindMs, time: Date.now() });
        }

        // Giriş IP'sini yakala ("joined the game" satırından önce gelir) — bellekte stash'le.
        // Konum/alt-hesap için player_sessions'a yazılır (ileriye dönük).
        const login = parseLoginIp(line);
        if (login) {
            if (!this._pendingIp) this._pendingIp = {};
            this._pendingIp[login.username] = login.ip;
            // Sıralama farklı geldiyse veya oturum zaten açıksa IP'yi hemen doldur
            try {
                const db = getDb();
                db.prepare(
                    'UPDATE player_sessions SET ip_address = ? WHERE username = ? AND ip_address IS NULL AND left_at IS NULL'
                ).run(login.ip, login.username);
            } catch { /* ignore */ }
        }

        // Oyuncu giriş/çıkış — chat ile taklit edilmesin diye log önekine (]:)
        // sabitlendi ve geçerli MC nick uzunluğuyla (1-16) sınırlandı. Sohbet
        // satırı "]: <Nick> ... joined the game" biçiminde olduğundan ]: ile nick
        // arasındaki "<...>" bu kalıbı eşleştirmez.
        const joinMatch = line.match(/\]:\s+(\w{1,16}) joined the game/);
        if (joinMatch && !this.players.includes(joinMatch[1])) {
            this.players.push(joinMatch[1]);
            this.emit('players', this.players);
            try {
                const db = getDb();
                const ip = this._pendingIp?.[joinMatch[1]] || null;
                db.prepare('INSERT INTO player_sessions (username, joined_at, ip_address) VALUES (?, ?, ?)')
                    .run(joinMatch[1], Date.now(), ip);
                if (this._pendingIp) delete this._pendingIp[joinMatch[1]];
            } catch { /* ignore */ }
        }
        const leaveMatch = line.match(/\]:\s+(\w{1,16}) left the game/);
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

        // List komutu çıktısı ile tam senkronizasyon
        // Örn: "There are 1 of a max of 20 players online: MsTwheel"
        const listMatch = line.match(/players online:\s*(.*)/i);
        if (listMatch) {
            const playersStr = listMatch[1].trim();
            if (playersStr) {
                // Oyuncu isimleri genelde virgülle ayrılır
                const currentPlayers = playersStr.split(',').map(p => p.trim()).filter(p => p);
                
                // Sadece değişiklik varsa emit et
                if (this.players.length !== currentPlayers.length || !this.players.every(p => currentPlayers.includes(p))) {
                    this.players = currentPlayers;
                    this.emit('players', this.players);
                }
            } else {
                if (this.players.length !== 0) {
                    this.players = [];
                    this.emit('players', this.players);
                }
            }
        }
    }

    // ── Java process izleyici (screen modu) ──────────────────────────────────

    _startStatusWatch() {
        this._stopStatusWatch();
        let loopCount = 0;
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
            
            // Periyodik komutlar (döngü her 5sn çalışır)
            loopCount++;
            if (this.status === 'running') {
                const sendSilent = (cmd) => {
                    try {
                        if (this._useScreen()) {
                            const execSync = require('child_process').execSync;
                            execSync(`screen -S ${this._screenName} -X stuff '${cmd}\r'`, { timeout: 3000, stdio: 'ignore' });
                        } else if (this.process?.stdin) {
                            this.process.stdin.write(cmd + '\n');
                        }
                    } catch { /* ignore */ }
                };

                // Her 30sn (6 döngü): TPS sorgula — adaptif komut tespiti
                if (loopCount % 6 === 0) this._sendTpsProbe(sendSilent);

                // Her 60sn (12 döngü): oyuncu listesini senkronize et + sayacı sıfırla
                if (loopCount % 12 === 0) {
                    sendSilent('list');
                    loopCount = 0;
                }
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
        this._startedAt   = null;
        this.processStats = { cpuPercent: 0, memoryMB: 0 };
        this._lastTps     = { one: null, five: null, fifteen: null };
        this._invalidateInfoCache();

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
        // 5 dakikalık çöküm penceresi
        if (!this._crashWindowStart || now - this._crashWindowStart > 300000) {
            this._crashCount = 0;
            this._crashWindowStart = now;
        }
        this._crashCount = (this._crashCount || 0) + 1;

        // Auto-restart ayarını oku
        let autoRestartEnabled = true;
        try {
            const db = getDb();
            const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_restart_enabled'").get();
            autoRestartEnabled = !setting || setting.value === '1';
            db.prepare('INSERT INTO crash_events (exit_code, auto_restarted, crash_count) VALUES (?, ?, ?)')
                .run(exitCode ?? -1, autoRestartEnabled ? 1 : 0, this._crashCount);
        } catch (err) {
            this.addLog(`[AutoRestart] DB hatası: ${err.message}`);
        }

        this.addLog(`[AutoRestart] Çöküm #${this._crashCount} (5dk içinde) · ayar=${autoRestartEnabled ? 'AÇIK' : 'KAPALI'} · exit=${exitCode}`);

        // Panel kapanıyorsa otomatik yeniden başlatma yapma
        if (this._shuttingDown) {
            this.addLog('[AutoRestart] Panel kapanıyor — yeniden başlatma atlandı.');
            return;
        }

        // Yapılandırılabilir maksimum çöküm sayısı (varsayılan 10, eskiden 5 idi)
        const MAX_CRASHES = parseInt(process.env.MAX_CRASHES_5MIN || '10', 10);
        if (this._crashCount >= MAX_CRASHES) {
            const msg = `[AutoRestart] 🔴 5 dakikada ${this._crashCount} çöküm (limit: ${MAX_CRASHES}). Restart döngüsü durduruldu. Manuel başlatınca sayaç sıfırlanır.`;
            this.addLog(msg);
            this.emit('log', msg);
            this.emit('crash', { code: exitCode, timestamp: now, autoRestarted: false, crashCount: this._crashCount, reason: 'max_crashes' });
            return;
        }

        this.emit('crash', { code: exitCode, timestamp: now, autoRestarted: autoRestartEnabled, crashCount: this._crashCount });

        try {
            const notificationService = require('./notificationService');
            notificationService.send('server_crash', `Sunucu çöktü (exit code: ${exitCode}). ${autoRestartEnabled ? 'Otomatik yeniden başlatma yapılıyor...' : 'Otomatik başlatma kapalı.'}`);
        } catch { /* ignore */ }

        if (!autoRestartEnabled) {
            const msg = '[AutoRestart] ⚠️ Otomatik başlatma KAPALI — manuel başlatma gerekiyor (Settings > Sunucu).';
            this.addLog(msg); this.emit('log', msg);
            return;
        }

        this._scheduleAutoRestart(1);
    }

    /**
     * Otomatik restart'ı tetikler. Başarısız olursa tekrar dener (max 3 deneme).
     */
    _scheduleAutoRestart(attempt) {
        const MAX_ATTEMPTS = 3;
        const delaySec = attempt === 1 ? 10 : (attempt === 2 ? 20 : 45);

        this.addLog(`[AutoRestart] 🔄 ${delaySec}sn içinde başlatılacak (deneme ${attempt}/${MAX_ATTEMPTS})`);
        this.emit('log', `[AutoRestart] 🔄 ${delaySec}sn içinde başlatma denemesi ${attempt}/${MAX_ATTEMPTS}…`);

        setTimeout(() => {
            if (this._shuttingDown) return;
            if (this.status !== 'stopped') {
                this.addLog(`[AutoRestart] Sunucu durumu '${this.status}' — restart iptal edildi.`);
                return;
            }
            try {
                this.addLog('[AutoRestart] ▶ start() çağrılıyor...');
                this.start({ fromAutoRestart: true });
                this.addLog('[AutoRestart] ✅ start() başarılı, sunucu başlatılıyor.');
            } catch (err) {
                this.addLog(`[AutoRestart] ❌ start() başarısız: ${err.message}`);
                this.emit('log', `[AutoRestart] ❌ start() başarısız (deneme ${attempt}): ${err.message}`);
                if (attempt < MAX_ATTEMPTS) {
                    this._scheduleAutoRestart(attempt + 1);
                } else {
                    const msg = `[AutoRestart] 🔴 ${MAX_ATTEMPTS} deneme başarısız — manuel müdahale gerekiyor.`;
                    this.addLog(msg); this.emit('log', msg);
                }
            }
        }, delaySec * 1000);
    }

    /** Sayaçları sıfırla — manuel start veya admin reset için */
    resetCrashCounter() {
        this._crashCount = 0;
        this._crashWindowStart = 0;
    }

    // ── Temel metodlar ───────────────────────────────────────────────────────

    getServerPath() {
        try {
            const db = getDb();
            const srv = db.prepare('SELECT path, active_modpack_id FROM servers WHERE id = ?')
                .get(this._serverConfig.id);
            // 1) Sunucuya atanmış paketin yolu — her zaman önce paket klasörüne bak
            //    (mods/config/world pakete özeldir, sunucu base path'ine değil)
            if (srv?.active_modpack_id) {
                const pack = db.prepare('SELECT install_path FROM installed_modpacks WHERE id = ?')
                    .get(srv.active_modpack_id);
                if (pack?.install_path?.trim()) return pack.install_path.trim();
            }
            // 2) Paketsiz sunucu — kendi path'ini kullan
            if (srv?.path?.trim()) return srv.path.trim();
            // 3) Global fallback: herhangi bir aktif modpack (geriye dönük uyumluluk)
            const globalPack = db.prepare('SELECT install_path FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
            if (globalPack?.install_path?.trim()) return globalPack.install_path.trim();
        } catch { /* fallback */ }
        return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    getActiveServer() {
        try {
            const db = getDb();
            return db.prepare('SELECT * FROM servers WHERE is_active = 1 LIMIT 1').get() || null;
        } catch { return null; }
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

        const wasRunning = this.status === 'running' || this.status === 'starting';

        if (wasRunning || this.process || this._javaPid) {
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

        if (this._serverConfig && this._serverConfig.id) {
            db.prepare('UPDATE servers SET active_modpack_id = ? WHERE id = ?').run(profileId, this._serverConfig.id);
        }

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
        
        if (wasRunning) {
            this.addLog(`[Profil] Sunucu otomatik olarak yeniden başlatılıyor...`);
            setTimeout(() => this.start(), 1000);
        }
        
        return { message: `"${target.name}" profili aktif edildi`, profile: target };
    }

    getServerJar() {
        return process.env.MINECRAFT_SERVER_JAR || 'forge-server.jar';
    }

    getStatus() {
        const tps = this._lastTps?.one ?? null;
        // MSPT: Forge'dan gerçek değer varsa onu kullan, yoksa yaklaşık hesapla
        let mspt = null;
        if (this._lastForgeMspt != null) {
            mspt = this._lastForgeMspt;
        } else if (tps != null) {
            mspt = tps >= 20 ? 50 : Math.round((1000 / Math.max(tps, 1)) * 10) / 10;
        }
        return {
            status: this.status,
            players: this.players,
            playerCount: this.players.length,
            pid: this._javaPid || (this.process ? this.process.pid : null),
            processStats: this.processStats,
            maxRamGB: this.getEffectiveMaxRamGB(),
            tps,
            mspt,
            connection: this._getConnectionInfo(),
            startedAt: this._startedAt || null,
            uptimeSec: this._startedAt ? Math.floor((Date.now() - this._startedAt) / 1000) : 0,
        };
    }

    // ── Adaptif TPS komut tespiti ────────────────────────────────────────────
    // Hangi sunucunun hangi TPS komutunu desteklediği bilinmez (Paper/Forge/
    // NeoForge/Fabric/vanilla 1.21+). Bu yüzden adayları sırayla dener, çalışanı
    // bulunca sadece onu gönderir, "Unknown command" dönenleri devre dışı bırakır.
    _tpsCandidateList() {
        // İsteğe bağlı override: app_settings.lagguard_tpsCommands (virgülle ayrık)
        try {
            const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'lagguard_tpsCommands'").get();
            if (row && row.value) {
                const list = row.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                if (list.length) return list;
            }
        } catch { /* ignore */ }
        // Varsayılan aday listesi (en olası → en az olası)
        return ['forge tps', 'neoforge tps', 'tick query', 'tps', 'spark tps'];
    }

    _resetTpsDetection() {
        this._tpsCmdCandidates = this._tpsCandidateList();
        this._tpsCmdDisabled = new Set();
        this._tpsCmdActive = null;
        this._tpsCmdProbing = null;
        this._tpsProbeIdx = 0;
        this._tpsCmdNoneLogged = false;
    }

    // Çalışan TPS komutu doğrulandığında (parse başarılı) çağrılır
    _markTpsCmdWorking() {
        if (this._tpsCmdProbing && !this._tpsCmdActive) {
            this._tpsCmdActive = this._tpsCmdProbing;
            this._tpsCmdProbing = null;
            this.addLog(`[LagGuard] TPS komutu tespit edildi: "${this._tpsCmdActive}"`);
        }
    }

    // 30sn'lik döngüde TPS komutu gönderir (adaptif)
    _sendTpsProbe(sendSilent) {
        if (!this._tpsCmdCandidates) this._resetTpsDetection();

        // Çalışan komut bulunmuşsa sadece onu gönder
        if (this._tpsCmdActive) { sendSilent(this._tpsCmdActive); return; }

        // Henüz çalışan komut yok: her döngüde bir adayı dene (round-robin).
        // Başarısız olan "<--[HERE]" tespitiyle devre dışı kalır; başarılı olan kilitlenir.
        const avail = this._tpsCmdCandidates.filter(c => !this._tpsCmdDisabled.has(c));
        if (avail.length === 0) {
            if (!this._tpsCmdNoneLogged) {
                this.addLog('[LagGuard] Çalışan TPS komutu bulunamadı (tps/forge tps/tick query yok). ' +
                    'Lag tespiti yalnızca "Can\'t keep up" ile sürecek. Spark kurarsanız otomatik algılanır.');
                this._tpsCmdNoneLogged = true;
            }
            return;
        }
        const cand = avail[this._tpsProbeIdx % avail.length];
        this._tpsProbeIdx++;
        this._tpsCmdProbing = cand;
        sendSilent(cand);
    }

    /** Bağlantı/RAM bilgisi önbelleğini geçersiz kıl (durum değişiminde çağrılır). */
    _invalidateInfoCache() {
        this._connInfoCache = null;
        this._maxRamCache = null;
    }

    /**
     * server.properties + modpack'ten bağlantı bilgisi.
     * getStatus() sık çağrıldığından (WS konsol her 3sn) sonuç ~10sn önbelleğe
     * alınır; aksi halde her çağrıda server.properties okuması + dizin taraması +
     * DB sorgusu yapılırdı. Durum değişiminde (start/stop) önbellek geçersiz kılınır.
     */
    _getConnectionInfo() {
        const TTL = 10000;
        if (!this._connInfoCache) this._connInfoCache = { value: null, ts: 0 };
        if (this._connInfoCache.value && (Date.now() - this._connInfoCache.ts) < TTL) {
            return this._connInfoCache.value;
        }
        try {
            const serverPath = this.getServerPath();
            const propsPath = path.join(serverPath, 'server.properties');
            let port = this._serverConfig?.port || 25565;
            let motd = '';
            let whitelist = false;
            if (fs.existsSync(propsPath)) {
                const content = fs.readFileSync(propsPath, 'utf-8');
                const portMatch = content.match(/^server-port=(\d+)/m);
                if (portMatch) port = parseInt(portMatch[1]);
                const motdMatch = content.match(/^motd=(.*)$/m);
                if (motdMatch) motd = motdMatch[1].trim();
                const wlMatch = content.match(/^white-list=(true|false)/m);
                if (wlMatch) whitelist = wlMatch[1] === 'true';
            }
            // MC versiyonu — modpack veya log üzerinden
            let mcVersion = null, loader = null;
            try {
                const db = getDb();
                if (this._serverConfig?.id) {
                    const srv = db.prepare('SELECT active_modpack_id FROM servers WHERE id = ?').get(this._serverConfig.id);
                    if (srv?.active_modpack_id) {
                        const pack = db.prepare('SELECT version FROM installed_modpacks WHERE id = ?').get(srv.active_modpack_id);
                        if (pack?.version) {
                            const mc = pack.version.match(/MC\s*([\d.]+)/i) || pack.version.match(/(\d+\.\d+(?:\.\d+)?)/);
                            if (mc) mcVersion = mc[1];
                        }
                    }
                }
            } catch { /* ignore */ }
            // Loader — server.jar veya install_path'ten tahmin
            try {
                const items = fs.readdirSync(serverPath);
                for (const it of items) {
                    const low = it.toLowerCase();
                    if (low.includes('forge') && low.endsWith('.jar'))      { loader = 'Forge';     break; }
                    if (low.includes('fabric') && low.endsWith('.jar'))     { loader = 'Fabric';    break; }
                    if (low.includes('neoforge') && low.endsWith('.jar'))   { loader = 'NeoForge';  break; }
                    if (low.includes('quilt') && low.endsWith('.jar'))      { loader = 'Quilt';     break; }
                    if (low.includes('paper') && low.endsWith('.jar'))      { loader = 'Paper';     break; }
                    if (low.includes('spigot') && low.endsWith('.jar'))     { loader = 'Spigot';    break; }
                }
            } catch { /* ignore */ }
            const info = { port, motd, whitelist, mcVersion, loader };
            this._connInfoCache = { value: info, ts: Date.now() };
            return info;
        } catch {
            const fallback = { port: 25565, motd: '', whitelist: false, mcVersion: null, loader: null };
            // Hatada da kısa süre önbelleğe al — sürekli başarısız I/O denemesini önle
            this._connInfoCache = { value: fallback, ts: Date.now() };
            return fallback;
        }
    }

    /**
     * Sunucuda etkin -Xmx değerini GB cinsinden döner.
     * Öncelik: server.jvm_args (-Xmx) → modpack.jvm_args → modpack.max_ram → env → 4
     */
    getEffectiveMaxRamGB() {
        const TTL = 10000;
        if (!this._maxRamCache) this._maxRamCache = { value: null, ts: 0 };
        if (this._maxRamCache.value != null && (Date.now() - this._maxRamCache.ts) < TTL) {
            return this._maxRamCache.value;
        }
        const val = this._computeEffectiveMaxRamGB();
        this._maxRamCache = { value: val, ts: Date.now() };
        return val;
    }

    _computeEffectiveMaxRamGB() {
        const parseXmx = (str) => {
            if (!str) return 0;
            const m = String(str).match(/-Xmx\s*(\d+)\s*([GgMmKk])/);
            if (!m) return 0;
            const val = parseInt(m[1]);
            const unit = m[2].toLowerCase();
            return unit === 'g' ? val : (unit === 'm' ? val / 1024 : val / 1048576);
        };
        const parseRam = (str) => {
            if (!str) return 0;
            const m = String(str).match(/(\d+)\s*([GgMmKk])/);
            if (!m) return 0;
            const val = parseInt(m[1]);
            const unit = m[2].toLowerCase();
            return unit === 'g' ? val : (unit === 'm' ? val / 1024 : val / 1048576);
        };
        try {
            // 1) Sunucunun kendi jvm_args'ı varsa -Xmx'i oradan çıkar
            const xFromServer = parseXmx(this._serverConfig?.jvm_args);
            if (xFromServer) return xFromServer;
            // 2) Aktif modpack
            const db = getDb();
            const srv = db.prepare('SELECT active_modpack_id FROM servers WHERE id = ?').get(this._serverConfig.id);
            if (srv?.active_modpack_id) {
                const pack = db.prepare('SELECT jvm_args, max_ram FROM installed_modpacks WHERE id = ?')
                    .get(srv.active_modpack_id);
                const xFromPack = parseXmx(pack?.jvm_args) || parseRam(pack?.max_ram);
                if (xFromPack) return xFromPack;
            }
            // 3) Genel fallback
            const globalPack = db.prepare('SELECT jvm_args, max_ram FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
            const xGlobal = parseXmx(globalPack?.jvm_args) || parseRam(globalPack?.max_ram);
            if (xGlobal) return xGlobal;
        } catch { /* ignore */ }
        // 4) Env
        const envMax = parseRam(process.env.MINECRAFT_MAX_RAM);
        if (envMax) return envMax;
        
        return 4; // Fallback to 4 GB if nothing is configured
    }

    // ── start() ──────────────────────────────────────────────────────────────

    start(opts = {}) {
        if (this.status === 'running' || this.status === 'starting') {
            throw new Error('Sunucu zaten çalışıyor');
        }
        // Yeni modpack/yapılandırma uygulanmış olabilir — önbelleği tazele
        this._invalidateInfoCache();

        // Manuel başlatma → çöküm sayacını sıfırla, aksi halde kullanıcı
        // hata düzelttikten sonra bile auto-restart blocklu kalıyordu
        if (!opts.fromAutoRestart) {
            this.resetCrashCounter();
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
                // RAM/JVM tamamen modpack veya env'den okunur (sunucuya özel RAM kaldırıldı)
                let pack = null;
                try {
                    const srv = db.prepare('SELECT active_modpack_id FROM servers WHERE id = ?').get(this._serverConfig.id);
                    if (srv?.active_modpack_id) {
                        pack = db.prepare('SELECT max_ram, min_ram, jvm_args FROM installed_modpacks WHERE id = ?').get(srv.active_modpack_id);
                    }
                    if (!pack) pack = db.prepare("SELECT max_ram, min_ram, jvm_args FROM installed_modpacks WHERE is_active = 1").get();
                } catch { /* ignore */ }
                const maxRam  = (pack && pack.max_ram)  || process.env.MINECRAFT_MAX_RAM || '4G';
                const minRam  = (pack && pack.min_ram)  || process.env.MINECRAFT_MIN_RAM || '2G';
                const jvmArgs = this._serverConfig?.jvm_args || (pack && pack.jvm_args) || process.env.JVM_ARGS || '';
                const jvmStr = jvmArgs || `-Xmx${maxRam} -Xms${minRam}`;
                // CPU flag dışarıdan enjekte edilebilir (ServerManager tarafından)
                const cpuFlag = this._cpuFlag || '';
                runCmd = `java ${jvmStr}${cpuFlag} -jar server.jar nogui`;
            }

            // Log dosyasını temizle
            try { fs.writeFileSync(this._logFile, ''); } catch { /* ignore */ }

            // Eski screen'i temizle — ama SADECE içinde Java yoksa.
            // Eğer Java çalışıyorsa paneli yeniden başlatmak sunucuyu öldürmesin.
            if (this._isScreenRunning()) {
                const existingPid = this._findJavaPid();
                if (existingPid) {
                    // Sunucu hâlâ çalışıyor; durumu düzelt ve başlatmayı iptal et
                    this._javaPid = existingPid;
                    this.status   = 'running';
                    if (!this._startedAt) this._startedAt = this._processStartedAt(existingPid) || Date.now();
                    this.emit('status', this.status);
                    this._startLogTail(true);
                    this._startStatsTracking();
                    this._startStatusWatch();
                    throw new Error('Sunucu zaten çalışıyor (screen + java mevcut)');
                }
                // Screen var ama Java yok — ölü screen oturumunu temizle
                try { execSync(`screen -S ${this._screenName} -X quit 2>/dev/null; true`, { stdio: 'ignore' }); } catch { /* ignore */ }
                try { execSync('sleep 0.3', { stdio: 'ignore' }); } catch { /* ignore */ }
            }

            // Screen başlat — çıktıyı log dosyasına yönlendir
            // cwd ve jvmArgs içindeki tek tırnak kaçırılır; özel karakterli
            // path/jvm_args değerlerinin bash enjeksiyonuna neden olması engellenir.
            const escapedCwd    = cwd.replace(/'/g, "'\\''");
            const escapedRunCmd = runCmd.replace(/'/g, "'\\''");
            const fullCmd = `cd '${escapedCwd}' && { ${escapedRunCmd}; } 2>&1 | tee '${this._logFile}'`;
            execSync(`screen -dmS ${this._screenName} bash -c ${JSON.stringify(fullCmd)}`, { stdio: 'ignore' });

            this.addLog(`[System] Sunucu başlatılıyor (screen: ${this._screenName})`);
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
                let pack = null;
                try {
                    const srv = db.prepare('SELECT active_modpack_id FROM servers WHERE id = ?').get(this._serverConfig.id);
                    if (srv?.active_modpack_id) {
                        pack = db.prepare('SELECT max_ram, min_ram, jvm_args FROM installed_modpacks WHERE id = ?').get(srv.active_modpack_id);
                    }
                    if (!pack) pack = db.prepare("SELECT max_ram, min_ram, jvm_args FROM installed_modpacks WHERE is_active = 1").get();
                } catch { /* ignore */ }
                const maxRam = (pack && pack.max_ram) || process.env.MINECRAFT_MAX_RAM || '4G';
                const minRam = (pack && pack.min_ram) || process.env.MINECRAFT_MIN_RAM || '2G';
                const jvmArgs = this._serverConfig?.jvm_args || (pack && pack.jvm_args) || process.env.JVM_ARGS || '';
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
                // Crash: çalışırken beklenmedik kapanma (Kullanıcı panelden kapatmadıysa)
                if (wasRunning && !wasStopping) {
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
            try { execSync(`screen -S ${this._screenName} -X quit 2>/dev/null; true`, { stdio: 'ignore' }); } catch { /* ignore */ }
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

            // NOT: once() kullanılamaz — stop() önce 'stopping' event'i emit eder ve
            // once dinleyicisi onu tüketip kendini kaldırır, gerçek 'stopped' asla
            // yakalanmaz. Bunun yerine kalıcı bir dinleyici kullanıp 'stopped'
            // dışındaki durumları yok sayıyor, 'stopped' gelince kendimizi kaldırıyoruz.
            let timer = null;
            const onStatus = (status) => {
                if (status !== 'stopped') return;
                this.off('status', onStatus);
                if (timer) { clearTimeout(timer); timer = null; }
                setTimeout(() => {
                    try { this.start(); resolve(); } catch (err) { reject(err); }
                }, 2000);
            };
            this.on('status', onStatus);

            // Güvenlik ağı: 'stopped' makul sürede gelmezse takılı kalma.
            // stop() 15sn sonra zorla kapatır, dolayısıyla 30sn fazlasıyla yeterli.
            timer = setTimeout(() => {
                this.off('status', onStatus);
                reject(new Error('Yeniden başlatma zaman aşımı: sunucu durmadı'));
            }, 30000);

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
            execSync(`screen -S ${this._screenName} -X stuff '${escaped}\r'`, { timeout: 3000 });
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

// ─── Modül export: legacy tek-sunuculu çağrıları default sunucuya yönlendir ────
// Eski kod (örn: `minecraftService.getStatus()`, `minecraftService.on('crash', ...)`)
// otomatik olarak DB'deki ilk sunucunun instance'ına yönlenir.
//
// Yeni kod ÇOKLU sunucu için doğrudan registry kullanmalı:
//   const registry = require('./serverRegistry');
//   registry.get(serverId).start();
const MS_PROXY = new Proxy(function () {}, {
    get(_, prop) {
        if (prop === 'MinecraftService') return MinecraftService;
        // Lazy require — döngüsel bağımlılık olmasın
        const registry = require('./serverRegistry');
        const def = registry.getDefault();
        if (!def) {
            // Sunucu yoksa: getStatus için makul varsayılan, diğerleri için undefined
            if (prop === 'getStatus') return () => ({ status: 'stopped', players: [], playerCount: 0, processStats: { cpuPercent: 0, memoryMB: 0 } });
            if (prop === 'status') return 'stopped';
            if (prop === 'players') return [];
            if (prop === 'on' || prop === 'off' || prop === 'once' || prop === 'emit' ||
                prop === 'addListener' || prop === 'removeListener') return () => {};
            return undefined;
        }
        const val = def[prop];
        return typeof val === 'function' ? val.bind(def) : val;
    },
    set(target, prop, value) {
        // MinecraftService class export'unu Proxy üzerine yapıştır
        if (prop === 'MinecraftService') { target[prop] = value; return true; }
        const registry = require('./serverRegistry');
        const def = registry.getDefault();
        if (def) def[prop] = value;
        return true;
    },
});

module.exports = MS_PROXY;
module.exports.MinecraftService = MinecraftService;
