/**
 * ftbChunksFile — FTB Chunks `ftbchunks-server.snbt` için hedefli (metin tabanlı) ayar okuma/yazma.
 *
 * ranks.snbt'den farkı: yönetilen anahtarlar kök `{ }` bloğunun içinde, ÜST seviyede durur
 * (ayrı bir alt blok yok). Yalnızca yönetilen anahtarları cerrahi olarak değiştiririz; dosyadaki
 * diğer (elle/varsayılan) anahtarlar dokunulmadan korunur.
 *
 * Saf string fonksiyonları (yan etkisiz) — birim testli (ftbChunksFile.test.js).
 */

// Form alanı → SNBT anahtarı. Yalnızca evrensel/kesin alanlar yönetilir (yanlış anahtar yazma riski yok).
const MANAGED = {
    maxClaimedChunks:     { key: 'max_claimed_chunks',      type: 'int' },
    maxForceLoadedChunks: { key: 'max_force_loaded_chunks', type: 'int' },
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function lineRe(key) {
    const k = escapeRe(key);
    return new RegExp(`^([ \\t]*)(?:"${k}"|${k})[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, 'm');
}
function parseIntVal(rawVal) { if (rawVal == null) return null; const m = String(rawVal).match(/-?\d+/); return m ? Number(m[0]) : null; }

/** Kök `{ … }` bloğunu bul (string içindeki { } " atlanır). @returns {{ bodyStart, bodyEnd } | null} */
function findRootBlock(raw) {
    const i0 = raw.indexOf('{');
    if (i0 < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = i0; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return { bodyStart: i0 + 1, bodyEnd: i }; }
    }
    return null;
}

/** Yönetilen ayarları oku. Anahtar yoksa null. */
function readSettings(raw) {
    const out = {};
    for (const [field, def] of Object.entries(MANAGED)) {
        const m = lineRe(def.key).exec(raw);
        out[field] = m ? parseIntVal(m[2]) : null;
    }
    return out;
}

// Kök gövdesinde anahtarı ayarla (varsa değiştir, yoksa ilk satır olarak ekle).
function setLine(body, key, value, inner) {
    const re = lineRe(key);
    const line = `${inner}${key}: ${value}`;
    if (re.test(body)) return body.replace(re, line);
    return `\n${line}${body}`;
}

/**
 * Yönetilen ayarları yaz. Yalnızca `settings` içinde geçerli sayı olan alanlar yazılır;
 * boş/null alanlar dosyada olduğu gibi bırakılır (çekirdek anahtar silinmez).
 */
function writeSettings(raw, settings) {
    const root = findRootBlock(raw);
    if (!root) throw new Error('Kök { } bloğu bulunamadı — dosya beklenen yapıda değil.');
    const inner = '\t';
    let body = raw.slice(root.bodyStart, root.bodyEnd);
    for (const [field, def] of Object.entries(MANAGED)) {
        if (!(field in settings)) continue;
        const v = settings[field];
        if (def.type === 'int') {
            if (v === '' || v == null || !Number.isFinite(Number(v))) continue; // boş → dokunma
            body = setLine(body, def.key, String(Number(v)), inner);
        }
    }
    return raw.slice(0, root.bodyStart) + body + raw.slice(root.bodyEnd);
}

module.exports = { MANAGED, findRootBlock, readSettings, writeSettings };
