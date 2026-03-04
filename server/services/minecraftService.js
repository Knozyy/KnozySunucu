const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class MinecraftService extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.status = 'stopped';
        this.players = [];
        this.logs = [];
        this.maxLogLines = 500;
        this.processStats = { cpuPercent: 0, memoryMB: 0 };
        this._statsInterval = null;
    }

    getServerPath() {
        return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    getServerJar() {
        return process.env.MINECRAFT_SERVER_JAR || 'forge-server.jar';
    }

    getStatus() {
        return {
            status: this.status,
            players: this.players,
            playerCount: this.players.length,
            pid: this.process ? this.process.pid : null,
            processStats: this.processStats,
        };
    }

    /**
     * Başlatma script'ini otomatik tespit et
     */
    _detectStartScript(serverPath) {
        const scriptPriority = process.platform === 'win32'
            ? ['run.bat', 'start.bat', 'startserver.bat', 'ServerStart.bat', 'run.ps1', 'start.ps1']
            : ['run.sh', 'startserver.sh', 'ServerStart.sh', 'start.sh'];

        for (const script of scriptPriority) {
            const scriptPath = path.join(serverPath, script);
            if (fs.existsSync(scriptPath)) {
                return { scriptPath, script };
            }
        }

        // Alt klasörlerde de ara
        try {
            const dirs = fs.readdirSync(serverPath).filter(d => {
                const full = path.join(serverPath, d);
                return fs.statSync(full).isDirectory() && !d.startsWith('.');
            });

            for (const dir of dirs) {
                const subDir = path.join(serverPath, dir);
                for (const script of scriptPriority) {
                    const scriptPath = path.join(subDir, script);
                    if (fs.existsSync(scriptPath)) {
                        return { scriptPath, script, cwd: subDir };
                    }
                }
            }
        } catch { /* ignore */ }

        return null;
    }

    /**
     * Mod loader'ı JAR dosyalarından tespit et
     */
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

    /**
     * MC versiyonunu tespit et
     */
    detectMinecraftVersion(serverPath) {
        const sPath = serverPath || this.getServerPath();

        // version.json'dan
        const versionFile = path.join(sPath, 'version.json');
        if (fs.existsSync(versionFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
                const ver = (data.id || '').split('-')[0];
                if (ver) return ver;
            } catch { /* ignore */ }
        }

        // JAR dosya isimlerinden
        try {
            const jars = fs.readdirSync(sPath).filter(f => f.endsWith('.jar'));
            for (const jar of jars) {
                const match = jar.match(/(\d+\.\d+\.?\d*)/);
                if (match) return match[1];
            }
        } catch { /* ignore */ }

        return '1.20.1';
    }

    start() {
        if (this.status === 'running') {
            throw new Error('Sunucu zaten çalışıyor');
        }

        const serverPath = this.getServerPath();

        // EULA otomatik kabul
        this._acceptEula(serverPath);

        // Başlatma script tespiti
        const scriptInfo = this._detectStartScript(serverPath);
        const cwd = (scriptInfo && scriptInfo.cwd) || serverPath;

        let cmd, args;

        if (scriptInfo) {
            // Script ile başlat
            const ext = path.extname(scriptInfo.script).toLowerCase();
            if (ext === '.bat') {
                cmd = 'cmd';
                args = ['/c', scriptInfo.scriptPath];
            } else if (ext === '.ps1') {
                cmd = 'powershell';
                args = ['-ExecutionPolicy', 'Bypass', '-File', scriptInfo.scriptPath];
            } else {
                // .sh
                // Make executable
                try { fs.chmodSync(scriptInfo.scriptPath, '755'); } catch { /* ignore */ }
                cmd = 'bash';
                args = [scriptInfo.scriptPath];
            }
            this.addLog(`[System] Script ile başlatılıyor: ${scriptInfo.script}`);
        } else {
            // Fallback: java -jar
            const serverJar = this.getServerJar();
            const jarPath = path.join(serverPath, serverJar);

            if (!fs.existsSync(jarPath)) {
                // Herhangi bir JAR ara
                const jars = fs.readdirSync(serverPath).filter(f =>
                    f.endsWith('.jar') && !f.toLowerCase().includes('installer')
                );
                if (jars.length === 0) {
                    throw new Error(`Server JAR bulunamadı: ${serverPath}`);
                }
            }

            const maxRam = process.env.MINECRAFT_MAX_RAM || '4G';
            const minRam = process.env.MINECRAFT_MIN_RAM || '2G';
            const jvmArgs = process.env.JVM_ARGS || '';

            cmd = 'java';
            args = [];

            // JVM argümanları
            if (jvmArgs) {
                args.push(...jvmArgs.split(' ').filter(a => a));
            } else {
                args.push(`-Xmx${maxRam}`, `-Xms${minRam}`);
            }

            args.push('-jar', this.getServerJar(), 'nogui');
            this.addLog(`[System] Java ile başlatılıyor: java ${args.join(' ')}`);
        }

        this.process = spawn(cmd, args, {
            cwd: cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.status = 'starting';
        this.emit('status', this.status);

        // Process stats takibi başlat
        this._startStatsTracking();

        this.process.stdout.on('data', (data) => {
            const line = data.toString().trim();
            if (!line) return;
            this.addLog(line);
            this.emit('log', line);

            if (line.includes('Done (') && line.includes(')!')) {
                this.status = 'running';
                this.emit('status', this.status);
            }

            const joinMatch = line.match(/(\w+) joined the game/);
            if (joinMatch && !this.players.includes(joinMatch[1])) {
                this.players.push(joinMatch[1]);
                this.emit('players', this.players);
            }

            const leaveMatch = line.match(/(\w+) left the game/);
            if (leaveMatch) {
                this.players = this.players.filter(p => p !== leaveMatch[1]);
                this.emit('players', this.players);
            }
        });

        this.process.stderr.on('data', (data) => {
            const line = data.toString().trim();
            if (!line) return;
            this.addLog(`[STDERR] ${line}`);
            this.emit('log', `[STDERR] ${line}`);
        });

        this.process.on('close', (code) => {
            const wasRunning = this.status === 'running' || this.status === 'starting';
            const wasStopping = this.status === 'stopping';
            this.status = 'stopped';
            this.players = [];
            this.process = null;
            this.processStats = { cpuPercent: 0, memoryMB: 0 };
            this._stopStatsTracking();
            this.emit('status', this.status);
            this.emit('log', `[System] Sunucu kapandı (exit code: ${code})`);

            // Otomatik çökme kurtarma
            if (wasRunning && !wasStopping && code !== 0) {
                this.addLog('[System] ⚠️ Sunucu beklenmedik şekilde çöktü! 10 saniye sonra otomatik yeniden başlatılacak...');
                this.emit('log', '[System] ⚠️ Sunucu çöktü! Otomatik yeniden başlatma 10sn...');

                // Discord bildirim gönder
                try {
                    const notificationService = require('./notificationService');
                    notificationService.send('server_crash', `Sunucu çöktü (exit code: ${code}). Otomatik yeniden başlatma yapılıyor...`);
                } catch { /* ignore */ }

                setTimeout(() => {
                    if (this.status === 'stopped') {
                        try {
                            this.addLog('[System] Otomatik yeniden başlatma başlatılıyor...');
                            this.start();
                        } catch (err) {
                            this.addLog(`[System] Otomatik başlatma başarısız: ${err.message}`);
                        }
                    }
                }, 10000);
            }
        });

        this.process.on('error', (err) => {
            this.status = 'error';
            this.emit('status', this.status);
            this.emit('log', `[Error] ${err.message}`);
        });
    }

    stop() {
        if (!this.process || this.status === 'stopped') {
            throw new Error('Sunucu zaten durmuş');
        }

        this.sendCommand('stop');
        this.status = 'stopping';
        this.emit('status', this.status);

        setTimeout(() => {
            if (this.process) {
                this.process.kill('SIGKILL');
            }
        }, 30000);
    }

    restart() {
        return new Promise((resolve, reject) => {
            if (this.status === 'stopped') {
                try {
                    this.start();
                    resolve();
                } catch (err) {
                    reject(err);
                }
                return;
            }

            this.once('status', (status) => {
                if (status === 'stopped') {
                    setTimeout(() => {
                        try {
                            this.start();
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    }, 2000);
                }
            });

            this.stop();
        });
    }

    sendCommand(command) {
        if (!this.process || (this.status !== 'running' && this.status !== 'starting' && this.status !== 'stopping')) {
            throw new Error('Sunucu çalışmıyor');
        }

        this.process.stdin.write(command + '\n');
        this.addLog(`> ${command}`);
        this.emit('log', `> ${command}`);
    }

    /**
     * Sunucu onarımı - bozuk kütüphaneleri sil
     */
    repair() {
        if (this.status !== 'stopped') {
            throw new Error('Onarım için sunucu durdurulmalı');
        }

        const serverPath = this.getServerPath();
        const targets = ['libraries', 'versions', 'installer.log', 'installer.log.1'];
        const deleted = [];

        // Ana dizin ve alt dizinlerde ara
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
                const targetPath = path.join(dir, target);
                try {
                    if (fs.existsSync(targetPath)) {
                        const stat = fs.statSync(targetPath);
                        if (stat.isDirectory()) {
                            fs.rmSync(targetPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                        deleted.push(target);
                    }
                } catch { /* ignore */ }
            }
        }

        if (deleted.length === 0) {
            return { message: 'Onarılacak dosya bulunamadı.' };
        }

        return { message: `Temizlenen dosyalar: ${deleted.join(', ')}. Sunucuyu tekrar başlatın.` };
    }

    /**
     * EULA otomatik kabul
     */
    _acceptEula(serverPath) {
        const eulaPath = path.join(serverPath, 'eula.txt');
        fs.writeFileSync(eulaPath, 'eula=true\n');

        // Alt klasörlerde de oluştur
        try {
            const dirs = fs.readdirSync(serverPath).filter(d => {
                const full = path.join(serverPath, d);
                return fs.statSync(full).isDirectory() && !d.startsWith('.');
            });

            for (const dir of dirs) {
                const subDirPath = path.join(serverPath, dir);
                const hasMods = fs.existsSync(path.join(subDirPath, 'mods'));
                const hasScript = ['run.sh', 'startserver.sh', 'start.sh'].some(s =>
                    fs.existsSync(path.join(subDirPath, s))
                );
                if (hasMods || hasScript) {
                    fs.writeFileSync(path.join(subDirPath, 'eula.txt'), 'eula=true\n');
                }
            }
        } catch { /* ignore */ }
    }

    /**
     * Process CPU/RAM izleme
     */
    _startStatsTracking() {
        this._stopStatsTracking();
        this._statsInterval = setInterval(() => {
            if (!this.process || !this.process.pid) return;
            try {
                // /proc/<pid>/stat okuyarak CPU ve bellek bilgisi al (Linux)
                if (process.platform === 'linux') {
                    const statFile = `/proc/${this.process.pid}/status`;
                    if (fs.existsSync(statFile)) {
                        const content = fs.readFileSync(statFile, 'utf-8');
                        const vmRss = content.match(/VmRSS:\s+(\d+)/);
                        if (vmRss) {
                            this.processStats.memoryMB = Math.round(parseInt(vmRss[1]) / 1024);
                        }
                    }
                }
            } catch { /* ignore */ }
        }, 5000);
    }

    _stopStatsTracking() {
        if (this._statsInterval) {
            clearInterval(this._statsInterval);
            this._statsInterval = null;
        }
    }

    addLog(line) {
        this.logs.push({
            time: new Date().toISOString(),
            message: line,
        });
        if (this.logs.length > this.maxLogLines) {
            this.logs = this.logs.slice(-this.maxLogLines);
        }
    }

    getRecentLogs(count = 100) {
        return this.logs.slice(-count);
    }

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
        const updatedLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return line;
            const key = trimmed.substring(0, eqIndex).trim();
            if (key in newProps) return `${key}=${newProps[key]}`;
            return line;
        });
        fs.writeFileSync(propsPath, updatedLines.join('\n'), 'utf-8');
    }
}

module.exports = new MinecraftService();
