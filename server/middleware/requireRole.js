const jwt = require('jsonwebtoken');

function requireRole(role) {
    return (req, res, next) => {
        // Eğer giriş yoksa önce authMiddleware'den geçmesi beklenir
        // Ancak bu middleware doğrudan kullanılıyorsa, auth kontrolü yapar:
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Yetkilendirme gerekli' });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
        }

        next();
    };
}

module.exports = requireRole;
