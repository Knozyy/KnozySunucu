/**
 * ftbChunksFile — FTB Chunks `ftbchunks-world.snbt` için hedefli (metin tabanlı) ayar okuma/yazma.
 *
 * Yapı notu: yönetilen anahtarlar iç içe bloklarda olabilir (örn. max_claimed_chunks → claiming: {},
 * max_force_loaded_chunks → force_loading: {}). Anahtar adları dosya genelinde BENZERSİZ olduğundan,
 * konumdan bağımsız bulup YERİNDE (mevcut girintiyi koruyarak) güncelleriz. Anahtar yoksa atlanır
 * (yanlış yuvalama seviyesine ekleme yapılmaz). Diğer tüm anahtar/yorumlar dokunulmadan korunur.
 *
 * Saf string fonksiyonları (yan etkisiz) — birim testli (ftbChunksFile.test.js).
 */

// Form alanı → SNBT anahtarı. enum: yalnızca values içinden bir değer kabul edilir.
const MANAGED = {
    maxClaimedChunks:     { key: 'max_claimed_chunks',      type: 'int' },
    maxForceLoadedChunks: { key: 'max_force_loaded_chunks', type: 'int' },
    disableProtection:    { key: 'disable_protection',      type: 'bool' },
    noWilderness:         { key: 'no_wilderness',           type: 'bool' },
    pvpMode:              { key: 'pvp_mode',                type: 'enum', values: ['always', 'never', 'per_team'] },
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// ^indent ("key"|key) : value$  — value satır sonuna kadar (yorum aynı satırda beklenmez).
function lineRe(key) {
    const k = escapeRe(key);
    return new RegExp(`^([ \\t]*)(?:"${k}"|${k})[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, 'm');
}
function parseIntVal(rawVal) { if (rawVal == null) return null; const m = String(rawVal).match(/-?\d+/); return m ? Number(m[0]) : null; }
function parseString(rawVal) {
    if (rawVal == null) return null;
    const m = String(rawVal).match(/^"((?:[^"\\]|\\.)*)"$/);
    return m ? m[1] : String(rawVal).trim();
}

/** Yönetilen ayarları oku. Anahtar yoksa null. */
function readSettings(raw) {
    const out = {};
    for (const [field, def] of Object.entries(MANAGED)) {
        const m = lineRe(def.key).exec(raw);
        const v = m ? m[2] : undefined;
        if (v === undefined) { out[field] = null; continue; }
        if (def.type === 'int') out[field] = parseIntVal(v);
        else if (def.type === 'bool') out[field] = /^(true|1b?)$/i.test(v.trim());
        else out[field] = parseString(v); // enum → düz string
    }
    return out;
}

// Anahtarı YERİNDE güncelle (girintiyi koru). Bulunamazsa null (ekleme yapma).
function setLine(raw, key, formattedValue) {
    const re = lineRe(key);
    const m = re.exec(raw);
    if (!m) return null;
    return raw.replace(re, `${m[1]}${key}: ${formattedValue}`);
}

/**
 * Yönetilen ayarları yaz. Yalnızca `settings` içinde GEÇERLİ ve dosyada VAR olan anahtarlar güncellenir;
 * boş/geçersiz değerler ve dosyada olmayan anahtarlar atlanır.
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
        } else if (def.type === 'bool') {
            formatted = v ? 'true' : 'false';
        } else { // enum
            if (!v || !def.values.includes(String(v))) continue;
            formatted = `"${v}"`;
        }
        const next = setLine(out, def.key, formatted);
        if (next != null) out = next; // anahtar yoksa dokunma
    }
    return out;
}

module.exports = { MANAGED, readSettings, writeSettings };
