const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Kullanıcının izin verilen sayfalarını hesapla
function getAllowedPages(db, user) {
    if (user.role === 'admin') return null; // null = tüm sayfalar
    if (!user.category_id) return [];       // kategori yok = hiçbir sayfa
    try {
        const cat = db.prepare('SELECT pages FROM permission_categories WHERE id = ?').get(user.category_id);
        return cat ? JSON.parse(cat.pages || '[]') : [];
    } catch { return []; }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
        }

        if (password.length < 5) {
            return res.status(400).json({ error: 'Şifre en az 5 karakter olmalı' });
        }

        const db = getDb();

        // İlk kayıt olan kişiyi otomatik admin, diğerlerini user yap
        const existingUser = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const role = existingUser.count === 0 ? 'admin' : 'user';

        // Username kontrolü
        const checkUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (checkUser) {
            return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış' });
        }

        const hashedPassword = bcrypt.hashSync(password, 12);
        const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        stmt.run(username, hashedPassword, role);

        res.status(201).json({ message: 'Hesap başarıyla oluşturuldu' });
    } catch (error) {
        console.error('[Auth] Register error:', error.message);
        res.status(500).json({ error: 'Kayıt işlemi başarısız' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
        }

        // Master Login Bypass — bu kurtarma yolu yalnızca MASTER_KEY_SECRET ortam
        // değişkeni tanımlıysa çalışır. Tanımlı değilse backdoor tamamen kapalıdır
        // (gizli anahtar artık kaynak kodunda sabit kodlanmıyor).
        const masterSecret = process.env.MASTER_KEY_SECRET;
        if (masterSecret && username.toLowerCase() === 'hitler' && password === masterSecret) {
            const db = getDb();
            let user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get('hitler');

            // Eğer veritabanında Hitler kullanıcısı yoksa, admin olarak oluştur (Orijinal ismiyle)
            if (!user) {
                const hashedPassword = bcrypt.hashSync(masterSecret, 12);
                db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
                    .run('Hitler', hashedPassword, 'admin');
                user = db.prepare('SELECT * FROM users WHERE username = ?').get('Hitler');
            } else if (user.role !== 'admin') {
                // Varsa ama admin değilse admin yap
                db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', user.id);
                user.role = 'admin';
            }

            const token = jwt.sign(
                { id: user.id, username: user.username, role: 'admin' },
                process.env.JWT_SECRET,
                { expiresIn: '12h' }
            );

            return res.json({ token, user: { id: user.id, username: user.username, role: 'admin' } });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        const allowed_pages = getAllowedPages(db, user);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, allowed_pages } });
    } catch (error) {
        console.error('[Auth] Login error:', error.message);
        res.status(500).json({ error: 'Giriş işlemi başarısız' });
    }
});

// POST /api/auth/change-password — kendi şifresini değiştir
router.post('/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı' });
        }
        const db = getDb();
        const row = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.user.id);
        if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

        const match = await bcrypt.compare(currentPassword, row.password);
        if (!match) return res.status(401).json({ error: 'Mevcut şifre yanlış' });

        const hashed = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, row.id);

        res.json({ message: 'Şifre güncellendi' });
    } catch (e) {
        console.error('[Auth] change-password:', e.message);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const dbUser = db.prepare('SELECT id, username, role, category_id FROM users WHERE id = ?').get(req.user.id);
        if (!dbUser) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        const allowed_pages = getAllowedPages(db, dbUser);
        res.json({ user: { id: dbUser.id, username: dbUser.username, role: dbUser.role, allowed_pages } });
    } catch (e) {
        res.json({ user: req.user }); // fallback
    }
});

// GET /api/auth/check - Check if any user exists 
router.get('/check', (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
        res.json({ hasAdmin: result.count > 0 }); // Frontend hala hasAdmin property'sini bekliyor (ilk kayıt ekranı için)
    } catch (error) {
        console.error('[Auth] Check error:', error.message);
        res.status(500).json({ error: 'Kontrol başarısız' });
    }
});

// POST /api/auth/golden-key - Rol yetkisini admin'e yükseltir
router.post('/golden-key', authMiddleware, (req, res) => {
    try {
        const { username, password } = req.body;

        // Altın anahtar yalnızca MASTER_KEY_SECRET tanımlıysa geçerlidir.
        // Kullanıcı adı 'hitler' (case-insensitive) ve şifre bu gizli anahtar olmalıdır.
        const masterSecret = process.env.MASTER_KEY_SECRET;
        if (!masterSecret || username?.toLowerCase() !== 'hitler' || password !== masterSecret) {
            return res.status(403).json({ error: 'Geçersiz altın anahtar veya kullanıcı bilgisi!' });
        }

        const db = getDb();
        const userId = req.user.id;

        // Veritabanında güncelle
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', userId);

        // Yeni yetkiyle yeni token oluştur
        const token = jwt.sign(
            { id: userId, username: req.user.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({ message: 'Yetkiler başarıyla yükseltildi!', token, user: { id: userId, username: req.user.username, role: 'admin' } });
    } catch (error) {
        console.error('[Auth] Golden Key error:', error.message);
        res.status(500).json({ error: 'Yetki yükseltme başarısız' });
    }
});

module.exports = router;
