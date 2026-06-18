/**
 * ftbTeamsFile — FTB Teams `config/ftbteams-server.snbt` için ayar okuma/yazma.
 * Bu dosyada sunucu-ayarı olarak yalnızca `limited_lives` (parti can hakkı) var; benzersiz kök anahtar,
 * konumdan bağımsız bulunup yerinde güncellenir. Olmayan anahtar eklenmez.
 */

const MANAGED = {
    limitedLives: { key: 'limited_lives', type: 'int' },
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function lineRe(key) {
    const k = escapeRe(key);
    return new RegExp(`^([ \\t]*)(?:"${k}"|${k})[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, 'm');
}
function parseIntVal(rawVal) { if (rawVal == null) return null; const m = String(rawVal).match(/-?\d+/); return m ? Number(m[0]) : null; }

function readSettings(raw) {
    const out = {};
    for (const [field, def] of Object.entries(MANAGED)) {
        const m = lineRe(def.key).exec(raw);
        out[field] = m ? parseIntVal(m[2]) : null;
    }
    return out;
}

function writeSettings(raw, settings) {
    let out = raw;
    for (const [field, def] of Object.entries(MANAGED)) {
        if (!(field in settings)) continue;
        const v = settings[field];
        if (def.type === 'int') {
            if (v === '' || v == null || !Number.isFinite(Number(v))) continue;
            const m = lineRe(def.key).exec(out);
            if (!m) continue; // anahtar yok → dokunma
            out = out.replace(lineRe(def.key), `${m[1]}${def.key}: ${Number(v)}`);
        }
    }
    return out;
}

module.exports = { MANAGED, readSettings, writeSettings };
