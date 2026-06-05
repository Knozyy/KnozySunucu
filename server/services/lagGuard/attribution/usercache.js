/**
 * LagGuard · Attribution · usercache (Faz 3)
 * ──────────────────────────────────────────
 * Sunucunun usercache.json'undan isim↔UUID eşlemesi okur. Bu, Minecraft'ın
 * yerel önbelleğidir (Mojang API'ye gerek yok) ve atıfta UUID ("claim sahibi
 * UUID birincil") için birincil kaynaktır.
 *
 * Format (standart): [{ "name": "X", "uuid": "....", "expiresOn": "..." }, ...]
 */
const fs = require('fs');
const path = require('path');

let _cache = { at: 0, map: {}, byUuid: {} };
const TTL = 30_000; // 30sn cache (dosya nadiren değişir)

function loadMap(serverPath) {
    if (!serverPath) return { map: {}, byUuid: {} };
    const now = Date.now();
    if (now - _cache.at < TTL && Object.keys(_cache.map).length) return _cache;
    const map = {};      // nameLower → uuid
    const byUuid = {};   // uuid → name
    try {
        const file = path.join(serverPath, 'usercache.json');
        if (fs.existsSync(file)) {
            const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(arr)) {
                for (const e of arr) {
                    if (e && e.name && e.uuid) {
                        map[String(e.name).toLowerCase()] = e.uuid;
                        byUuid[e.uuid] = e.name;
                    }
                }
            }
        }
    } catch { /* bozuk/erişilemez — boş dön */ }
    _cache = { at: now, map, byUuid };
    return _cache;
}

module.exports = {
    /** İsimden UUID (yoksa null). */
    uuidOf(serverPath, name) {
        if (!name) return null;
        return loadMap(serverPath).map[String(name).toLowerCase()] || null;
    },
    /** UUID'den isim (yoksa null). */
    nameOf(serverPath, uuid) {
        if (!uuid) return null;
        return loadMap(serverPath).byUuid[uuid] || null;
    },
    loadMap,
};
