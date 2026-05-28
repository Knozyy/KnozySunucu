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
        const users = db.prepare(`
            SELECT u.id, u.username, u.role, u.created_at, u.category_id,
                   pc.name AS category_name, pc.color AS category_color
            FROM users u
            LEFT JOIN permission_categories pc ON u.category_id = pc.id
            ORDER BY u.id ASC
        `).all();
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

    if (password.length < 5) {
        return res.status(400).json({ error: 'Şifre en az 5 karakter olmalı' });
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

        // Hitler kullanıcısının silinmesini engelle
        const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (targetUser && targetUser.username.toLowerCase() === 'hitler') {
            return res.status(403).json({ error: 'Bu kullanıcı sistem tarafından korunmaktadır ve silinemez.' });
        }

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

        // Hitler kullanıcısının yetkisinin değiştirilmesini engelle
        const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (targetUser && targetUser.username.toLowerCase() === 'hitler') {
            return res.status(403).json({ error: 'Bu kullanıcı sistem tarafından korunmaktadır ve yetkisi değiştirilemez.' });
        }

        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        res.json({ message: 'Kullanıcı rolü güncellendi' });
    } catch (error) {
        console.error('[Users] Rol değiştirme hatası:', error.message);
        res.status(500).json({ error: 'Rol güncellenemedi' });
    }
});

// PUT /api/users/:id/category — kategori ata
router.put('/:id/category', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { category_id } = req.body; // null = kategori kaldır
        const db = getDb();
        db.prepare('UPDATE users SET category_id = ? WHERE id = ?').run(category_id || null, req.params.id);
        res.json({ message: 'Kategori güncellendi' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
