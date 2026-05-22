// server/routes/push.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getDb } = require('../db/database');
const pushService = require('../services/pushService');

const router = express.Router();

// GET /api/push/vapid-public-key — frontend subscribe için public key döner
router.get('/vapid-public-key', authMiddleware, (req, res) => {
    try {
        const { publicKey } = pushService.getVapidKeys();
        res.json({ publicKey });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/push/subscribe — push aboneliğini kaydeder
router.post('/subscribe', authMiddleware, (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription.endpoint gerekli' });

        const db = getDb();
        db.prepare(`
            INSERT INTO push_subscriptions (user_id, endpoint, subscription)
            VALUES (?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription
        `).run(req.user.id, subscription.endpoint, JSON.stringify(subscription));

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/push/unsubscribe — push aboneliğini siler
router.delete('/unsubscribe', authMiddleware, (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ error: 'endpoint gerekli' });

        const db = getDb();
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
            .run(req.user.id, endpoint);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
