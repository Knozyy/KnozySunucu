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
}

module.exports = new SystemService();
