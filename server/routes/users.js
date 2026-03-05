const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Tüm kullanıcıları listele (Sadece Admin)
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
        res.json({ users });
    } catch (error) {
        console.error('[Users] Listeleme hatası:', error.message);
        res.status(500).json({ error: 'Kullanıcılar listelenirken bir hata oluştu' });
    }
});

// Yeni kullanıcı ekle (Sadece Admin)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur' });
    }

    try {
        const db = getDb();
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

        if (existingUser) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const assignedRole = role === 'admin' ? 'admin' : 'user';

        const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            .run(username, hashedPassword, assignedRole);

        res.status(201).json({
            message: 'Kullanıcı başarıyla oluşturuldu',
            user: {
                id: result.lastInsertRowid,
                username,
                role: assignedRole
            }
        });
    } catch (error) {
        console.error('[Users] Kullanıcı oluşturma hatası:', error.message);
        res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu' });
    }
});

// Kullanıcı sil (Sadece Admin)
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    const userId = req.params.id;

    // Kendini silmeyi engelle
    if (req.user.id === parseInt(userId)) {
        return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    }

    try {
        const db = getDb();
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ message: 'Kullanıcı silindi' });
    } catch (error) {
        console.error('[Users] Kullanıcı silme hatası:', error.message);
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
});

// Rol güncelle (Sadece Admin)
router.put('/:id/role', authMiddleware, requireRole('admin'), (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Geçersiz rol' });
    }

    // Kendini yetkisizleştirmeyi (user yapmayı) engellemek iyi bir fikir olabilir
    if (req.user.id === parseInt(userId) && role === 'user') {
        return res.status(400).json({ error: 'Kendi admin yetkinizi alamazsınız' });
    }

    try {
        const db = getDb();
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        res.json({ message: 'Kullanıcı rolü güncellendi' });
    } catch (error) {
        console.error('[Users] Rol değiştirme hatası:', error.message);
        res.status(500).json({ error: 'Rol güncellenemedi' });
    }
});

module.exports = router;
