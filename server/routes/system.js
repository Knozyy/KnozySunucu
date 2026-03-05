const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const systemService = require('../services/systemService');

const router = express.Router();

// GET /api/system/info - Total system info
router.get('/info', authMiddleware, async (req, res) => {
    try {
        const info = await systemService.getSystemInfo();
        res.json(info);
    } catch (error) {
        console.error('[System] Info error:', error.message);
        res.status(500).json({ error: 'Sistem bilgisi alınamadı' });
    }
});

// GET /api/system/usage - Current usage
router.get('/usage', authMiddleware, async (req, res) => {
    try {
        const usage = await systemService.getUsage();
        res.json(usage);
    } catch (error) {
        console.error('[System] Usage error:', error.message);
        res.status(500).json({ error: 'Kullanım bilgisi alınamadı' });
    }
});

// GET /api/system/uptime
router.get('/uptime', authMiddleware, (req, res) => {
    try {
        const uptime = systemService.getUptime();
        res.json(uptime);
    } catch (error) {
        console.error('[System] Uptime error:', error.message);
        res.status(500).json({ error: 'Uptime bilgisi alınamadı' });
    }
});

// GET /api/system/ram-settings - Mevcut RAM ayarlarını getir (akıllı varsayılan)
router.get('/ram-settings', authMiddleware, async (req, res) => {
    try {
        const si = require('systeminformation');
        const mem = await si.mem();
        const totalGB = +(mem.total / (1024 ** 3)).toFixed(1);

        // .env'de kullanıcı bir kere ayarlamışsa onu döndür
        const currentMin = process.env.MINECRAFT_MIN_RAM;
        const currentMax = process.env.MINECRAFT_MAX_RAM;
        const jvmArgs = process.env.JVM_ARGS || '';
        // RAM_CONFIGURED flag'i — kullanıcı en az 1 kere ayarladıysa true
        const isConfigured = process.env.RAM_CONFIGURED === 'true';

        // Akıllı varsayılan: max = total - 2GB, min = max'in %60'ı
        const smartMaxGB = Math.max(2, Math.floor(totalGB - 2));
        const smartMinGB = Math.max(1, Math.floor(smartMaxGB * 0.6));

        res.json({
            minRam: currentMin || `${smartMinGB}G`,
            maxRam: currentMax || `${smartMaxGB}G`,
            jvmArgs,
            isConfigured,
            system: {
                totalGB,
                maxAllocatable: smartMaxGB,
            },
        });
    } catch (error) {
        console.error('[System] RAM settings error:', error.message);
        res.status(500).json({ error: 'RAM ayarları alınamadı' });
    }
});

// PUT /api/system/ram-settings - RAM ayarlarını kaydet
router.put('/ram-settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { minRam, maxRam, jvmArgs } = req.body;
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(__dirname, '../../.env');

        let envContent = fs.readFileSync(envPath, 'utf-8');

        if (minRam) {
            envContent = envContent.replace(/MINECRAFT_MIN_RAM=.*/g, `MINECRAFT_MIN_RAM=${minRam}`);
        }
        if (maxRam) {
            envContent = envContent.replace(/MINECRAFT_MAX_RAM=.*/g, `MINECRAFT_MAX_RAM=${maxRam}`);
        }

        // JVM_ARGS
        if (jvmArgs !== undefined) {
            if (envContent.includes('JVM_ARGS=')) {
                envContent = envContent.replace(/JVM_ARGS=.*/g, `JVM_ARGS=${jvmArgs}`);
            } else {
                envContent += `\nJVM_ARGS=${jvmArgs}`;
            }
        }

        // RAM_CONFIGURED flag'i — kullanıcı artık RAM ayarladı
        if (envContent.includes('RAM_CONFIGURED=')) {
            envContent = envContent.replace(/RAM_CONFIGURED=.*/g, 'RAM_CONFIGURED=true');
        } else {
            envContent += '\nRAM_CONFIGURED=true';
        }

        fs.writeFileSync(envPath, envContent);

        // Runtime'da güncelle
        if (minRam) process.env.MINECRAFT_MIN_RAM = minRam;
        if (maxRam) process.env.MINECRAFT_MAX_RAM = maxRam;
        if (jvmArgs !== undefined) process.env.JVM_ARGS = jvmArgs;
        process.env.RAM_CONFIGURED = 'true';

        res.json({
            message: 'RAM ayarları güncellendi. Sunucuyu yeniden başlatın.',
            current: {
                minRam: process.env.MINECRAFT_MIN_RAM,
                maxRam: process.env.MINECRAFT_MAX_RAM,
                jvmArgs: process.env.JVM_ARGS || '',
            }
        });
    } catch (error) {
        console.error('[System] RAM settings error:', error.message);
        res.status(500).json({ error: 'RAM ayarları güncellenemedi' });
    }
});

// GET /api/system/connection-info - Sunucu bağlantı bilgisi
router.get('/connection-info', authMiddleware, async (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const si = require('systeminformation');

        // IP adresi al
        const nets = os.networkInterfaces();
        let serverIp = '0.0.0.0';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    serverIp = net.address;
                    break;
                }
            }
        }

        // server.properties'den port oku
        let serverPort = '25565';
        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        const propsPath = path.join(serverPath, 'server.properties');
        if (fs.existsSync(propsPath)) {
            const content = fs.readFileSync(propsPath, 'utf-8');
            const portMatch = content.match(/server-port=(\d+)/);
            if (portMatch) serverPort = portMatch[1];
        }

        // External IP (opsiyonel)
        let externalIp = null;
        try {
            const https = require('https');
            externalIp = await new Promise((resolve) => {
                https.get('https://api.ipify.org?format=json', (r) => {
                    let data = '';
                    r.on('data', c => { data += c; });
                    r.on('end', () => { try { resolve(JSON.parse(data).ip); } catch { resolve(null); } });
                }).on('error', () => resolve(null));
                setTimeout(() => resolve(null), 3000);
            });
        } catch { /* ignore */ }

        const connectCmd = serverPort === '25565'
            ? (externalIp || serverIp)
            : `${externalIp || serverIp}:${serverPort}`;

        res.json({
            localIp: serverIp,
            externalIp,
            port: serverPort,
            connectCommand: connectCmd,
            hostname: os.hostname(),
        });
    } catch (error) {
        console.error('[System] Connection info error:', error.message);
        res.status(500).json({ error: 'Bağlantı bilgisi alınamadı' });
    }
});
// GET /api/system/processes - Çalışan Java (Sunucu) süreçlerini listele
router.get('/processes', authMiddleware, async (req, res) => {
    try {
        const targetProcesses = await systemService.getProcesses(true);
        res.json({ processes: targetProcesses });
    } catch (error) {
        console.error('[System] Processes fetch error:', error.message);
        res.status(500).json({ error: 'İşlem listesi alınamadı' });
    }
});

// POST /api/system/processes/kill - Bir süreci sonlandır
router.post('/processes/kill', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { pid } = req.body;
        if (!pid) return res.status(400).json({ error: 'PID gerekli' });

        const isWindows = process.platform === 'win32';
        const { spawnSync } = require('child_process');

        if (isWindows) {
            spawnSync('taskkill', ['/PID', pid, '/F', '/T']);
        } else {
            try {
                process.kill(pid, 'SIGKILL');
            } catch (e) {
                // Ignore if process already dead
            }
        }

        res.json({ message: 'İşlem başarıyla sonlandırıldı' });
    } catch (error) {
        console.error('[System] Kill error:', error.message);
        res.status(500).json({ error: 'İşlem sonlandırılamadı' });
    }
});

module.exports = router;
