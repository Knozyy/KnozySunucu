const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const terminalService = require('../services/terminalService');

const router = express.Router();

// Screen listesi (filesystem seviyesi — herhangi bir oturumdan bağımsız)
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

// Screen'e attach — artık WebSocket üzerinden yapılıyor (her sekme kendi PTY'sinde).
// Bu endpoint geriye dönük uyumluluk için no-op olarak duruyor.
router.post('/screens/:name/attach', authMiddleware, requireRole('admin'), (req, res) => {
    res.json({ message: 'Attach artık WebSocket üzerinden yapılıyor', via: 'ws' });
});

// Screen'e doğrudan komut gönder (attach gerekmez, screen -X stuff)
router.post('/screens/:name/send', authMiddleware, requireRole('admin'), (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Komut gerekli' });
    try {
        terminalService.sendToScreen(req.params.name, command);
        res.json({ message: 'Komut gönderildi' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// Eski "tek paylaşımlı PTY'de çalıştır" endpoint'i — artık WS üzerinden yapılıyor.
// FTB yönlendirmesi de WS'ye `?run=...` parametresi ile gönderiyor.
router.post('/run', authMiddleware, requireRole('admin'), (req, res) => {
    res.json({ message: 'Komutlar artık WebSocket üzerinden çalıştırılıyor', via: 'ws' });
});

module.exports = router;
