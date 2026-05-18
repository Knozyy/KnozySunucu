const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/templates
router.get('/', authMiddleware, (req, res) => {
    try {
        const rows = getDb().prepare('SELECT * FROM server_templates ORDER BY id DESC').all();
        res.json({ templates: rows.map(r => ({ ...r, config: JSON.parse(r.config) })) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/templates — mevcut aktif profili şablon olarak kaydet
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Şablon adı gerekli' });

        const db = getDb();
        const active = db.prepare('SELECT * FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
        const config = active ? {
            name:          active.name,
            version:       active.version,
            install_path:  active.install_path,
            server_port:   active.server_port,
            min_ram:       active.min_ram,
            max_ram:       active.max_ram,
            jvm_args:      active.jvm_args,
        } : {};

        // Manuel config de merge et
        const merged = { ...config, ...(req.body.config || {}) };

        db.prepare('INSERT INTO server_templates (name, description, config) VALUES (?, ?, ?)')
            .run(name.trim(), description?.trim() || '', JSON.stringify(merged));
        res.json({ message: 'Şablon kaydedildi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/templates/:id — şablon uygula (aktif profile ayarlarını yaz)
router.put('/:id/apply', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const tmpl = db.prepare('SELECT * FROM server_templates WHERE id = ?').get(req.params.id);
        if (!tmpl) return res.status(404).json({ error: 'Şablon bulunamadı' });

        const cfg = JSON.parse(tmpl.config);
        const active = db.prepare('SELECT id FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
        if (!active) return res.status(400).json({ error: 'Aktif profil yok' });

        const fields = ['min_ram', 'max_ram', 'jvm_args', 'server_port'].filter(k => cfg[k] !== undefined);
        if (fields.length === 0) return res.json({ message: 'Uygulanacak ayar yok' });

        const sets = fields.map(f => `${f} = ?`).join(', ');
        const vals = fields.map(f => cfg[f]);
        db.prepare(`UPDATE installed_modpacks SET ${sets} WHERE id = ?`).run(...vals, active.id);
        res.json({ message: 'Şablon uygulandı' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/templates/:id
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        getDb().prepare('DELETE FROM server_templates WHERE id = ?').run(req.params.id);
        res.json({ message: 'Şablon silindi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
