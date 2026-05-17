const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const terminalService = require('../services/terminalService');

const router = express.Router();

// Screen listesi
router.get('/screens', authMiddleware, (req, res) => {
    try {
        res.json({ screens: terminalService.listScreens() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Yeni screen oluştur
router.post('/screens', authMiddleware, requireRole('admin'), (req, res) => {
    const { name } = req.body;
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ error: 'Geçersiz screen adı (sadece harf, rakam, _ ve - kullanılabilir)' });
    }
    try {
        terminalService.createScreen(name);
        res.json({ message: `Screen '${name}' oluşturuldu` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Screen'e attach (terminal PTY'sine komut yazar)
router.post('/screens/:name/attach', authMiddleware, requireRole('admin'), (req, res) => {
    terminalService.attachScreen(req.params.name);
    res.json({ message: `Screen '${req.params.name}' attach komutu gönderildi` });
});

// Screen kapat
router.delete('/screens/:name', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        terminalService.killScreen(req.params.name);
        res.json({ message: `Screen '${req.params.name}' kapatıldı` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Terminale komut çalıştır (FTB / modpack kurulum yönlendirme için)
router.post('/run', authMiddleware, requireRole('admin'), (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Komut gerekli' });
    terminalService.runInTerminal(command);
    res.json({ message: 'Komut terminale gönderildi' });
});

module.exports = router;
