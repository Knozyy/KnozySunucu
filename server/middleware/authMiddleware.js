const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yetkilendirme token\'ı gerekli' });
    }

    const token = authHeader.split(' ')[1];

    // Try JWT first
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        return next();
    } catch { /* fall through to API token check */ }

    // Try API token (starts with "knozy_")
    if (token.startsWith('knozy_')) {
        try {
            const { findByToken } = require('../routes/apiTokens');
            const apiUser = findByToken(token);
            if (apiUser) {
                req.user = apiUser;
                return next();
            }
        } catch { /* ignore */ }
    }

    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
}

module.exports = authMiddleware;
