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

        if (password.length < 6) {
            return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
        }

        const db = getDb();

        // Sadece 1 admin izni
        const existingUser = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (existingUser.count > 0) {
            return res.status(403).json({ error: 'Kayıt devre dışı. Zaten bir admin mevcut.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 12);
        const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        stmt.run(username, hashedPassword);

        res.status(201).json({ message: 'Admin hesabı oluşturuldu' });
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
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({ token, user: { id: user.id, username: user.username } });
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
        res.json({ hasAdmin: result.count > 0 });
    } catch (error) {
        console.error('[Auth] Check error:', error.message);
        res.status(500).json({ error: 'Kontrol başarısız' });
    }
});

module.exports = router;
