/**
 * ftbEssentialsFile — FTB Essentials `config/ftbessentials.snbt` için yol-tabanlı (path) ayar okuma/yazma.
 *
 * Bu dosyada anahtarlar iç içe bloklarda ve aynı ad birden çok yerde geçiyor (cooldown/max/enabled
 * her komutta var). Bu yüzden anahtarı YOL ile buluruz: örn. ['teleportation','home','max'].
 * Sadece çok-satırlı bloklardaki ve tek-anahtarlı tek-satır bloklardaki ({ enabled: true }) güvenli
 * alanlar yönetilir; çok-anahtarlı tek-satır bloklar (spawn/tpa/warp: { a; b; c }) yönetilmez.
 *
 * Yalnızca yönetilen alanlar YERİNDE güncellenir; gerisi dokunulmadan korunur. Saf string fonksiyonları.
 */

// Form alanı → SNBT yolu + tip. (Güvenli alanlar: home/back/rtp çok-satırlı + misc.*.enabled tek-anahtar.)
const MANAGED = {
    homeMax:        { path: ['teleportation', 'home', 'max'],          type: 'int' },
    homeCooldown:   { path: ['teleportation', 'home', 'cooldown'],     type: 'int' },
    homeWarmup:     { path: ['teleportation', 'home', 'warmup'],       type: 'int' },
    backCooldown:   { path: ['teleportation', 'back', 'cooldown'],     type: 'int' },
    backMax:        { path: ['teleportation', 'back', 'max'],          type: 'int' },
    rtpCooldown:    { path: ['teleportation', 'rtp', 'cooldown'],      type: 'int' },
    rtpMaxDistance: { path: ['teleportation', 'rtp', 'max_distance'],  type: 'int' },
    rtpMinDistance: { path: ['teleportation', 'rtp', 'min_distance'],  type: 'int' },
    cmdEnderchest:  { path: ['misc', 'enderchest', 'enabled'],  type: 'bool' },
    cmdHat:         { path: ['misc', 'hat', 'enabled'],         type: 'bool' },
    cmdNear:        { path: ['misc', 'near', 'enabled'],        type: 'bool' },
    cmdNick:        { path: ['misc', 'nick', 'enabled'],        type: 'bool' },
    cmdTrashcan:    { path: ['misc', 'trashcan', 'enabled'],    type: 'bool' },
    cmdCrafting:    { path: ['misc', 'crafting', 'enabled'],    type: 'bool' },
    cmdAnvil:       { path: ['misc', 'anvil', 'enabled'],       type: 'bool' },
    cmdSmithing:    { path: ['misc', 'smithing', 'enabled'],    type: 'bool' },
    cmdStonecutter: { path: ['misc', 'stonecutter', 'enabled'], type: 'bool' },
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function lineRe(key) {
    const k = escapeRe(key);
    return new RegExp(`^([ \\t]*)(?:"${k}"|${k})[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, 'm');
}
function parseIntVal(rawVal) { if (rawVal == null) return null; const m = String(rawVal).match(/-?\d+/); return m ? Number(m[0]) : null; }

// `<key>: { … }` bloğunu bul (string içindeki { } " atlanır). @returns {{ bodyStart, bodyEnd } | null}
function findBlock(raw, key) {
    const decl = new RegExp(`^([ \\t]*)(?:"${escapeRe(key)}"|${escapeRe(key)})[ \\t]*:[ \\t]*\\{`, 'm');
    const m = decl.exec(raw);
    if (!m) return null;
    const braceStart = m.index + m[0].length - 1;
    let depth = 0, inStr = false, esc = false;
    for (let i = braceStart; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return { bodyStart: braceStart + 1, bodyEnd: i }; }
    }
    return null;
}

// Yolu izleyerek son anahtarın değer satırını bul. @returns {{ start, end, indent, value } | null} (mutlak konum)
function findValueLine(raw, pathArr) {
    let lo = 0, hi = raw.length;
    for (let i = 0; i < pathArr.length - 1; i++) {
        const b = findBlock(raw.slice(lo, hi), pathArr[i]);
        if (!b) return null;
        const base = lo;
        lo = base + b.bodyStart;
        hi = base + b.bodyEnd;
    }
    const inner = raw.slice(lo, hi);
    const m = lineRe(pathArr[pathArr.length - 1]).exec(inner);
    if (!m) return null;
    const start = lo + m.index;
    return { start, end: start + m[0].length, indent: m[1], value: m[2] };
}

/** Yönetilen ayarları oku. Anahtar yoksa null. */
function readSettings(raw) {
    const out = {};
    for (const [field, def] of Object.entries(MANAGED)) {
        const v = findValueLine(raw, def.path);
        if (!v) { out[field] = null; continue; }
        out[field] = def.type === 'int' ? parseIntVal(v.value) : /^(true|1b?)$/i.test(v.value.trim());
    }
    return out;
}

/**
 * Yönetilen ayarları yaz. Yalnızca geçerli değer verilen VE dosyada var olan alanlar yerinde güncellenir;
 * boş/geçersiz değer ve olmayan yol atlanır (yanlış yere ekleme yok).
 */
function writeSettings(raw, settings) {
    let out = raw;
    for (const [field, def] of Object.entries(MANAGED)) {
        if (!(field in settings)) continue;
        const v = settings[field];
        let formatted = null;
        if (def.type === 'int') {
            if (v === '' || v == null || !Number.isFinite(Number(v))) continue;
            formatted = String(Number(v));
        } else {
            formatted = v ? 'true' : 'false';
        }
        const loc = findValueLine(out, def.path);
        if (!loc) continue; // yol/anahtar yok → dokunma
        out = out.slice(0, loc.start) + `${loc.indent}${def.path[def.path.length - 1]}: ${formatted}` + out.slice(loc.end);
    }
    return out;
}

module.exports = { MANAGED, findBlock, findValueLine, readSettings, writeSettings };
