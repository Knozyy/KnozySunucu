// server/routes/dashboard.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/dashboard/layout — kullanıcıya ait layout JSON döner
router.get('/layout', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const key = `dashboard_layout_${req.user.id}`;
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
        if (!row) return res.json({ layout: null });
        res.json({ layout: JSON.parse(row.value) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dashboard/layout — layout JSON'u app_settings'e kaydeder
router.put('/layout', authMiddleware, (req, res) => {
    try {
        const { layout } = req.body;
        if (!Array.isArray(layout)) return res.status(400).json({ error: 'layout array olmalı' });
        const db = getDb();
        const key = `dashboard_layout_${req.user.id}`;
        db.prepare(`
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(key, JSON.stringify(layout));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
