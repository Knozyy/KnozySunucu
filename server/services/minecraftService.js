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
        };
    }

    start() {
        if (this.status === 'running') {
            throw new Error('Sunucu zaten çalışıyor');
        }

        const serverPath = this.getServerPath();
        const serverJar = this.getServerJar();
        const jarPath = path.join(serverPath, serverJar);

        if (!fs.existsSync(jarPath)) {
            throw new Error(`Server JAR bulunamadı: ${jarPath}`);
        }

        const maxRam = process.env.MINECRAFT_MAX_RAM || '4G';
        const minRam = process.env.MINECRAFT_MIN_RAM || '2G';

        this.process = spawn('java', [
            `-Xmx${maxRam}`,
            `-Xms${minRam}`,
            '-jar',
            serverJar,
            'nogui',
        ], {
            cwd: serverPath,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.status = 'starting';
        this.emit('status', this.status);

        this.process.stdout.on('data', (data) => {
            const line = data.toString().trim();
            if (!line) return;

            this.addLog(line);
            this.emit('log', line);

            // Detect server started
            if (line.includes('Done (') && line.includes(')!')) {
                this.status = 'running';
                this.emit('status', this.status);
            }

            // Detect player join
            const joinMatch = line.match(/(\w+) joined the game/);
            if (joinMatch && !this.players.includes(joinMatch[1])) {
                this.players.push(joinMatch[1]);
                this.emit('players', this.players);
            }

            // Detect player leave
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
            this.status = 'stopped';
            this.players = [];
            this.process = null;
            this.emit('status', this.status);
            this.emit('log', `[System] Sunucu kapandı (exit code: ${code})`);
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

        // Force kill after 30 seconds
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
        if (!this.process || this.status !== 'running') {
            throw new Error('Sunucu çalışmıyor');
        }

        this.process.stdin.write(command + '\n');
        this.addLog(`> ${command}`);
        this.emit('log', `> ${command}`);
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

    // Read server.properties 
    getProperties() {
        const propsPath = path.join(this.getServerPath(), 'server.properties');

        if (!fs.existsSync(propsPath)) {
            return {};
        }

        const content = fs.readFileSync(propsPath, 'utf-8');
        const properties = {};

        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return;

            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim();
            properties[key] = value;
        });

        return properties;
    }

    // Update server.properties
    setProperties(newProps) {
        const propsPath = path.join(this.getServerPath(), 'server.properties');

        if (!fs.existsSync(propsPath)) {
            throw new Error('server.properties bulunamadı');
        }

        const content = fs.readFileSync(propsPath, 'utf-8');
        const lines = content.split('\n');
        const updatedLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return line;

            const key = trimmed.substring(0, eqIndex).trim();
            if (key in newProps) {
                return `${key}=${newProps[key]}`;
            }

            return line;
        });

        fs.writeFileSync(propsPath, updatedLines.join('\n'), 'utf-8');
    }
}

module.exports = new MinecraftService();
