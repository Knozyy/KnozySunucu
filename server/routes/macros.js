const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');
const mcService = require('../services/minecraftService');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT * FROM command_macros ORDER BY sort_order ASC, id ASC').all();
        const macros = rows.map(r => ({ ...r, commands: JSON.parse(r.commands || '[]') }));
        res.json(macros);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, description = '', commands = [], color = '#6366f1', sort_order = 0 } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'İsim gerekli' });
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO command_macros (name, description, commands, color, sort_order) VALUES (?, ?, ?, ?, ?)'
        ).run(name.trim(), description.trim(), JSON.stringify(commands), color, sort_order);
        const created = db.prepare('SELECT * FROM command_macros WHERE id = ?').get(result.lastInsertRowid);
        res.json({ ...created, commands: JSON.parse(created.commands) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, description, commands, color, sort_order } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'İsim gerekli' });
        const db = getDb();
        db.prepare(
            'UPDATE command_macros SET name=?, description=?, commands=?, color=?, sort_order=? WHERE id=?'
        ).run(name.trim(), description?.trim() ?? '', JSON.stringify(commands ?? []), color ?? '#6366f1', sort_order ?? 0, req.params.id);
        const updated = db.prepare('SELECT * FROM command_macros WHERE id = ?').get(req.params.id);
        if (!updated) return res.status(404).json({ error: 'Makro bulunamadı' });
        res.json({ ...updated, commands: JSON.parse(updated.commands) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM command_macros WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/execute', authMiddleware, async (req, res) => {
    try {
        const db = getDb();
        const macro = db.prepare('SELECT * FROM command_macros WHERE id = ?').get(req.params.id);
        if (!macro) return res.status(404).json({ error: 'Makro bulunamadı' });

        const commands = JSON.parse(macro.commands || '[]');
        if (commands.length === 0) return res.status(400).json({ error: 'Makroda komut yok' });

        // serverId varsa o sunucu instance'ını kullan
        let targetService = mcService;
        const { delayMs = 500, serverId } = req.body;
        if (serverId) {
            try {
                const { serverManager } = require('../services/serverManager');
                const inst = serverManager.getInstance(parseInt(serverId));
                if (inst) targetService = inst;
            } catch { /* fallback to primary */ }
        }

        if (targetService.status !== 'running') {
            return res.status(400).json({ error: 'Sunucu çalışmıyor' });
        }

        const sent = [];

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i].trim();
            if (!cmd) continue;
            if (i > 0 && delayMs > 0) {
                await new Promise(r => setTimeout(r, Math.min(delayMs, 5000)));
            }
            targetService.sendCommand(cmd);
            sent.push(cmd);
        }

        res.json({ ok: true, sent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
