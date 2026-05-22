const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const timedWhitelistService = require('../services/timedWhitelistService');

const router = express.Router();

// Aktif restart sayaçları (id → {timeouts, delayMinutes, startedAt, warnings})
const activeCountdowns = new Map();

// ── Süreli Whitelist ──────────────────────────────────────────────────────────

// GET /api/automation/timed-whitelist
router.get('/timed-whitelist', authMiddleware, (req, res) => {
    try {
        res.json({ entries: timedWhitelistService.list() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/automation/timed-whitelist
router.post('/timed-whitelist', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { mcNick, durationDays = 0, durationHours = 0, addedBy } = req.body;
        if (!mcNick?.trim()) return res.status(400).json({ error: 'mcNick gerekli' });
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(mcNick.trim()))
            return res.status(400).json({ error: 'Geçersiz MC nick (3-16 karakter, harf/rakam/alt çizgi)' });

        const entry = timedWhitelistService.add({
            mcNick: mcNick.trim(),
            addedBy: addedBy || null,
            durationDays: Number(durationDays),
            durationHours: Number(durationHours),
        });

        // MC sunucusuna whitelist add gönder
        try {
            const mcService = require('../services/minecraftService');
            mcService.sendCommand(`whitelist add ${entry.mcNick}`);
        } catch { /* Sunucu kapalıysa sessizce geç */ }

        res.status(201).json({ message: `${entry.mcNick} geçici whitelist'e eklendi.`, entry });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/automation/timed-whitelist/:id
router.delete('/timed-whitelist/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const entry = timedWhitelistService.remove(parseInt(req.params.id));

        // MC sunucusundan whitelist remove gönder
        try {
            const mcService = require('../services/minecraftService');
            mcService.sendCommand(`whitelist remove ${entry.mc_nick}`);
        } catch { /* ignore */ }

        res.json({ message: `${entry.mc_nick} whitelist'ten çıkarıldı.` });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Restart Sayacı ────────────────────────────────────────────────────────────

// GET /api/automation/restart-countdown — aktif sayaçları listele
router.get('/restart-countdown', authMiddleware, (req, res) => {
    const countdowns = Array.from(activeCountdowns.entries()).map(([id, c]) => ({
        id,
        delayMinutes: c.delayMinutes,
        startedAt: c.startedAt,
        remainingMs: Math.max(0, (c.startedAt + c.delayMinutes * 60 * 1000) - Date.now()),
        warnings: c.warnings,
    }));
    res.json({ countdowns });
});

// POST /api/automation/restart-countdown — yeni sayaç başlat
router.post('/restart-countdown', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { delayMinutes, warnings = [30, 10, 5, 1] } = req.body;
        if (!delayMinutes || Number(delayMinutes) < 1)
            return res.status(400).json({ error: 'delayMinutes en az 1 olmalı' });

        const delay = Number(delayMinutes);
        const mcService = require('../services/minecraftService');
        const id = Date.now();
        const timeouts = [];

        // Uyarı mesajları
        const validWarnings = warnings.filter(w => Number(w) > 0 && Number(w) < delay);
        for (const warnMin of validWarnings) {
            const waitMs = (delay - Number(warnMin)) * 60 * 1000;
            const t = setTimeout(() => {
                try {
                    mcService.sendCommand(`say §c[Otomasyon] ⚠ Sunucu ${warnMin} dakika içinde yeniden başlatılacak!`);
                } catch { /* ignore */ }
            }, waitMs);
            timeouts.push(t);
        }

        // Asıl restart
        const restartT = setTimeout(async () => {
            try {
                mcService.sendCommand('say §c[Otomasyon] 🔄 Sunucu şimdi yeniden başlatılıyor...');
                await new Promise(r => setTimeout(r, 3000));
                await mcService.restart();
            } catch (e) {
                console.error('[AutoRestart] Restart hatası:', e.message);
            } finally {
                activeCountdowns.delete(id);
            }
        }, delay * 60 * 1000);
        timeouts.push(restartT);

        activeCountdowns.set(id, { timeouts, delayMinutes: delay, startedAt: Date.now(), warnings: validWarnings });

        res.json({
            message: `Sayaç başlatıldı. ${delay} dakika içinde restart.`,
            id,
            warnings: validWarnings,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/automation/restart-countdown/:id — sayacı iptal et
router.delete('/restart-countdown/:id', authMiddleware, requireRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    const countdown = activeCountdowns.get(id);
    if (!countdown) return res.status(404).json({ error: 'Sayaç bulunamadı' });
    countdown.timeouts.forEach(t => clearTimeout(t));
    activeCountdowns.delete(id);
    try {
        const mcService = require('../services/minecraftService');
        mcService.sendCommand('say §a[Otomasyon] ✅ Zamanlanmış yeniden başlatma iptal edildi.');
    } catch { /* ignore */ }
    res.json({ message: 'Sayaç iptal edildi.' });
});

module.exports = router;
