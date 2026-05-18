const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/permission-categories
router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const cats = db.prepare(`
            SELECT pc.*, COUNT(u.id) AS user_count
            FROM permission_categories pc
            LEFT JOIN users u ON u.category_id = pc.id
            GROUP BY pc.id
            ORDER BY pc.name
        `).all();
        res.json({ categories: cats.map(c => ({ ...c, pages: JSON.parse(c.pages || '[]') })) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/permission-categories
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, pages = [], color = '#6366f1' } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Kategori adı gerekli' });
        const db = getDb();
        const result = db.prepare('INSERT INTO permission_categories (name, pages, color) VALUES (?, ?, ?)')
            .run(name.trim(), JSON.stringify(pages), color);
        res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), pages, color });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/permission-categories/:id
router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, pages = [], color = '#6366f1' } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Kategori adı gerekli' });
        const db = getDb();
        db.prepare('UPDATE permission_categories SET name = ?, pages = ?, color = ? WHERE id = ?')
            .run(name.trim(), JSON.stringify(pages), color, req.params.id);
        res.json({ message: 'Güncellendi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/permission-categories/:id
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        // Kategoriye bağlı kullanıcıların category_id'sini sıfırla
        db.prepare('UPDATE users SET category_id = NULL WHERE category_id = ?').run(req.params.id);
        db.prepare('DELETE FROM permission_categories WHERE id = ?').run(req.params.id);
        res.json({ message: 'Kategori silindi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
