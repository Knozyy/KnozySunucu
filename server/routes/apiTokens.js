const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');

const router = express.Router();

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// GET /api/tokens — list all (no plaintext shown)
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const rows = getDb().prepare('SELECT id, name, token_prefix, created_by, last_used_at, expires_at, is_active, created_at FROM api_tokens ORDER BY id DESC').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tokens — create; returns plaintext ONCE
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, expiresInDays } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'İsim gerekli' });

        const plaintext = 'knozy_' + crypto.randomBytes(24).toString('hex');
        const prefix    = plaintext.slice(0, 14);
        const hash      = hashToken(plaintext);
        const expiresAt = expiresInDays ? Math.floor(Date.now() / 1000) + expiresInDays * 86400 : null;

        const db = getDb();
        const result = db.prepare(
            'INSERT INTO api_tokens (name, token_prefix, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
        ).run(name.trim(), prefix, hash, req.user?.username || 'admin', expiresAt);

        res.json({ id: result.lastInsertRowid, name: name.trim(), token: plaintext, prefix, expiresAt });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/tokens/:id — revoke
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        getDb().prepare('UPDATE api_tokens SET is_active = 0 WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper exported for authMiddleware
function findByToken(token) {
    try {
        const hash = hashToken(token);
        const row = getDb().prepare('SELECT * FROM api_tokens WHERE token_hash = ? AND is_active = 1').get(hash);
        if (!row) return null;
        if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return null;
        // Update last_used_at
        getDb().prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), row.id);
        return { id: row.id, username: row.created_by, role: 'admin', isApiToken: true };
    } catch { return null; }
}

module.exports = router;
module.exports.findByToken = findByToken;
