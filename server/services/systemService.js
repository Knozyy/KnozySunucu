const si = require('systeminformation');

class SystemService {
    async getSystemInfo() {
        const [cpu, mem, disk, os, networkInterfaces] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.fsSize(),
            si.osInfo(),
            si.networkInterfaces(),
        ]);

        return {
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: cpu.brand,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
                speed: cpu.speed,
                speedMax: cpu.speedMax,
            },
            memory: {
                total: mem.total,
                free: mem.free,
                used: mem.used,
                active: mem.active,
                available: mem.available,
            },
            disk: disk.map(d => ({
                fs: d.fs,
                type: d.type,
                size: d.size,
                used: d.used,
                available: d.available,
                use: d.use,
                mount: d.mount,
            })),
            os: {
                platform: os.platform,
                distro: os.distro,
                release: os.release,
                hostname: os.hostname,
                arch: os.arch,
                kernel: os.kernel,
            },
            network: networkInterfaces
                .filter(n => !n.internal)
                .map(n => ({
                    iface: n.iface,
                    ip4: n.ip4,
                    ip6: n.ip6,
                    mac: n.mac,
                    speed: n.speed,
                })),
        };
    }

    async getUsage() {
        const [cpuLoad, mem, disk, networkStats, cpuTemperature] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkStats(),
            si.cpuTemperature(),
        ]);

        return {
            cpu: {
                currentLoad: cpuLoad.currentLoad,
                currentLoadUser: cpuLoad.currentLoadUser,
                currentLoadSystem: cpuLoad.currentLoadSystem,
                cpus: cpuLoad.cpus?.map(c => c.load) || [],
            },
            memory: {
                total: mem.total,
                used: mem.active,
                free: mem.available,
                active: mem.active,
                available: mem.available,
                usagePercent: ((mem.active / mem.total) * 100),
            },
            disk: disk.map(d => ({
                mount: d.mount,
                size: d.size,
                used: d.used,
                available: d.available,
                usePercent: d.use,
            })),
            network: networkStats
                .filter(n => n.rx_bytes > 0 || n.tx_bytes > 0)
                .map(n => ({
                    iface: n.iface,
                    rx_bytes: n.rx_bytes,
                    tx_bytes: n.tx_bytes,
                    rx_sec: n.rx_sec,
                    tx_sec: n.tx_sec,
                })),
            temperature: cpuTemperature.main || null,
            uptime: require('os').uptime(),
        };
    }

    getUptime() {
        const uptime = require('os').uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        return {
            raw: uptime,
            formatted: `${days}g ${hours}s ${minutes}d ${seconds}sn`,
            days,
            hours,
            minutes,
            seconds,
        };
    }

    /**
     * Çalışan işlemleri döndürür.
     * Linux'ta htop/ps benzeri (toplam system cores oranlı 0-100%).
     * Sadece hedef (java, ngrok, playit) veya istenirse hepsi döndürülebilir.
     */
    async getProcesses(filterTarget = false) {
        const isLinux = process.platform === 'linux';
        let processes = [];

        if (isLinux) {
            const { execSync } = require('child_process');
            const os = require('os');
            const cores = os.cpus().length || 1;

            try {
                // ps -eo pid,ppid,%cpu,rss,user,comm,args
                const out = execSync('ps -eo pid,ppid,%cpu,rss,user,comm,args').toString();
                const lines = out.split('\n').slice(1).filter(Boolean);

                for (const line of lines) {
                    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
                    if (match) {
                        const [_, pid, ppid, cpu, rss, user, comm, args] = match;
                        const fullCmd = args || comm;
                        const memMB = (parseInt(rss) / 1024).toFixed(1);
                        const scaledCpu = +(parseFloat(cpu) / cores).toFixed(1);

                        processes.push({
                            pid: parseInt(pid),
                            parentPid: parseInt(ppid),
                            name: comm,
                            cpu: scaledCpu,
                            mem: memMB,
                            user: user,
                            command: fullCmd,
                            started: 'N/A'
                        });
                    }
                }
            } catch (err) {
                console.error('[SystemService] ps komutu hatası:', err.message);
            }
        } else {
            try {
                const processData = await si.processes();
                processes = processData.list.map(p => ({
                    pid: p.pid,
                    parentPid: p.parentPid,
                    name: p.name,
                    cpu: +(p.cpu.toFixed(1)),
                    mem: (p.memRss / 1024).toFixed(1),
                    user: p.user,
                    command: p.command,
                    started: p.started
                }));
            } catch (err) {
                console.error('[SystemService] si.processes hatası:', err.message);
            }
        }

        if (filterTarget) {
            processes = processes.filter(p => {
                const cmd = (p.command || '').toLowerCase();
                const name = (p.name || '').toLowerCase();
                return name.includes('java') || cmd.includes('java') ||
                    name.includes('ngrok') || name.includes('playit');
            });
        }

        // Parent/Child Process Tree (Süreç Ağacı) CPU/RAM toplamı için yardımcı fonksiyon eklentisi (Tree map)
        this._buildProcessTreeData(processes);

        return processes;
    }

    /**
     * İşlemler ağacını kurar, bir process'in kendisi ve tüm child process'lerinin
     * toplam (tree) cpu ve ram değerlerini `treeCpu` ve `treeMem` özelliklerine ekler.
     */
    _buildProcessTreeData(processes) {
        const byId = new Map();
        processes.forEach(p => {
            p.treeCpu = p.cpu || 0;
            p.treeMem = parseFloat(p.mem) || 0;
            byId.set(p.pid, p);
        });

        // Her process için kendi yükünü parentlarına ekle root'a kadar
        // (Bu MinecraftWrapper için Java'nın CPU'sunu saptamayı sağlar)
        processes.forEach(p => {
            let current = byId.get(p.parentPid);
            const seen = new Set([p.pid]); // circular tree protection
            while (current && !seen.has(current.pid)) {
                seen.add(current.pid);
                current.treeCpu += (p.cpu || 0);
                current.treeMem += (parseFloat(p.mem) || 0);
                current = byId.get(current.parentPid);
            }
        });
    }
}

module.exports = new SystemService();
