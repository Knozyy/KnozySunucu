const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/audit?limit=100&user=xxx&action=xxx
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const user = req.query.user?.trim();
        const action = req.query.action?.trim();

        let sql = 'SELECT * FROM audit_log';
        const params = [];
        const filters = [];
        if (user)   { filters.push('user LIKE ?');   params.push(`%${user}%`); }
        if (action) { filters.push('action LIKE ?'); params.push(`%${action}%`); }
        if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);

        const rows = getDb().prepare(sql).all(...params);
        res.json({ logs: rows, total: rows.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/audit — logları temizle (admin only)
router.delete('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        getDb().prepare('DELETE FROM audit_log').run();
        res.json({ message: 'Audit log temizlendi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
