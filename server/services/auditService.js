const { getDb } = require('../db/database');

function logAudit(user, action, details = '', ip = '') {
    try {
        getDb().prepare(
            'INSERT INTO audit_log (user, action, details, ip) VALUES (?, ?, ?, ?)'
        ).run(user || 'sistem', action, details, ip);
    } catch { /* ignore */ }
}

module.exports = { logAudit };
