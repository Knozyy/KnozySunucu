const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => { res.json({ settings: notificationService.getSettings() }); });

router.put('/:type', authMiddleware, (req, res) => {
    try { notificationService.updateSetting(req.params.type, req.body); res.json({ message: 'Ayar güncellendi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/test-webhook', authMiddleware, async (req, res) => {
    try {
        await notificationService.testWebhook(req.body.webhookUrl);
        res.json({ message: 'Test mesajı gönderildi' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
