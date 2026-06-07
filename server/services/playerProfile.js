/** ban_log'dan oyuncunun ban/unban geçmişi (yeni→eski). */
function getBanHistory(db, username) {
  return db.prepare('SELECT * FROM ban_log WHERE username = ? ORDER BY id DESC').all(username);
}

/** Oyuncunun bilinen IP'lerini paylaşan FARKLI kullanıcılar. */
function findAltAccounts(db, username) {
  const ips = db.prepare(
    'SELECT DISTINCT ip_address FROM player_sessions WHERE username = ? AND ip_address IS NOT NULL'
  ).all(username).map(r => r.ip_address);
  if (!ips.length) return [];
  const placeholders = ips.map(() => '?').join(',');
  return db.prepare(`
    SELECT username, ip_address AS ip, MAX(joined_at) AS lastSeen
    FROM player_sessions
    WHERE ip_address IN (${placeholders}) AND username != ?
    GROUP BY username, ip_address
    ORDER BY lastSeen DESC
  `).all(...ips, username);
}

/** Oturumları güne göre toplayıp grafik serisi döner (eski→yeni). */
function getPlaytimeDaily(db, username) {
  const rows = db.prepare(`
    SELECT CAST(joined_at / 86400000 AS INTEGER) AS day,
           SUM(COALESCE(duration_seconds,0)) AS seconds
    FROM player_sessions
    WHERE username = ?
    GROUP BY day ORDER BY day ASC
  `).all(username);
  return rows.map(r => ({ day: r.day, date: new Date(r.day * 86400000).toISOString().slice(0, 10), seconds: r.seconds }));
}

module.exports = { getBanHistory, findAltAccounts, getPlaytimeDaily };
