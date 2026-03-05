const jwt = require('jsonwebtoken');

function requireRole(roles) {
    const rolesArray = Array.isArray(roles) ? roles : [roles];

    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Yetkilendirme gerekli' });
        }

        if (!rolesArray.includes(req.user.role)) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
        }

        next();
    };
}

module.exports = requireRole;
