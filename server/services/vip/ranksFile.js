/**
 * ranksFile — FTB Ranks `ranks.snbt` için hedefli (metin tabanlı) perk okuma/yazma.
 *
 * Neden metin tabanlı: ConfigParser SNBT desteklemiyor, prismarine-nbt binary NBT içindir.
 * FTB metin-SNBT'si (tırnaksız anahtar, virgülsüz, tip ekleri) için bloğu parantez eşleyerek
 * bulup yalnızca yönetilen anahtarları cerrahi olarak değiştiririz — name/power/condition ve
 * şema dışı (elle eklenmiş) anahtarlar dokunulmadan korunur.
 *
 * Saf string fonksiyonları (yan etkisiz) — birim testli (ranksFile.test.js).
 */

// Form alanı → SNBT anahtarı eşlemesi (.planning/specs/2026-06-09-vip-ranks-editoru-tasarim.md)
const MANAGED = {
    nameFormat:     { key: 'ftbranks.name_format',        type: 'string' },
    homeMax:        { key: 'ftbessentials.home.max',      type: 'int' },
    homeCooldown:   { key: 'ftbessentials.home.cooldown', type: 'int' },
    back:           { key: 'command.back',                type: 'bool' },
    rtp:            { key: 'command.rtp',                  type: 'bool' },  // FTB Essentials /rtp (her pakette yok)
    tpr:            { key: 'command.moonlight.tpr',        type: 'bool' },  // Moonlight /tpr (rastgele ışınla)
    enderchest:     { key: 'command.enderchest',          type: 'bool' },
    spawn:          { key: 'command.spawn',                type: 'bool' },
    hat:            { key: 'command.hat',                  type: 'bool' },
    nickname:       { key: 'command.nickname',             type: 'bool' },
    craftingTable:  { key: 'command.open.crafting',        type: 'bool' },  // taşınabilir craft masası
    anvil:          { key: 'command.open.anvil',           type: 'bool' },
    smithing:       { key: 'command.open.smithing',        type: 'bool' },
    stonecutter:    { key: 'command.open.stonecutter',     type: 'bool' },
    trashcan:       { key: 'command.trashcan',             type: 'bool' },
    maxClaimed:     { key: 'ftbchunks.max_claimed',       type: 'int' },
    maxForceLoaded: { key: 'ftbchunks.max_force_loaded',  type: 'int' },
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Bir gövde satırını eşleyen regex: ^indent ("key"|key) : value$  (anahtar tırnaklı/tırnaksız)
function lineRe(key) {
    const k = escapeRe(key);
    return new RegExp(`^([ \\t]*)(?:"${k}"|${k})[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, 'm');
}

// Boş perk seti — MANAGED'dan türetilir (yeni alan eklenince otomatik dahil olur).
function emptyPerks() {
    const p = {};
    for (const [field, def] of Object.entries(MANAGED)) p[field] = def.type === 'bool' ? false : null;
    return p;
}

// "..." → içerik (snbt string kaçışlarını çöz). Tırnaksızsa olduğu gibi döner.
function parseString(rawVal) {
    if (rawVal == null) return null;
    const m = rawVal.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (!m) return rawVal;
    return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
function parseBool(rawVal) { return rawVal != null && /^(true|1b?)$/i.test(rawVal.trim()); }
function parseIntVal(rawVal) { if (rawVal == null) return null; const m = String(rawVal).match(/-?\d+/); return m ? Number(m[0]) : null; }

function formatString(s) { return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }

/**
 * `<rankKey>: { … }` bloğunu bul. String içindeki { } " atlanır (parantez sayımı bozulmaz).
 * @returns {{ start, end, indent, bodyStart, bodyEnd } | null}
 *   start = anahtarın başı · end = eşleşen } sonrası · body = (bodyStart, bodyEnd) arası.
 */
function findBlock(raw, rankKey) {
    const decl = new RegExp(`^([ \\t]*)(?:"${escapeRe(rankKey)}"|${escapeRe(rankKey)})[ \\t]*:[ \\t]*\\{`, 'm');
    const m = decl.exec(raw);
    if (!m) return null;
    const indent = m[1];
    const keyStart = m.index + indent.length;
    const braceStart = m.index + m[0].length - 1; // '{' konumu

    let depth = 0, inStr = false, esc = false, i = braceStart;
    for (; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    if (depth !== 0) return null; // kapanmamış blok
    return { start: keyStart, end: i, indent, bodyStart: braceStart + 1, bodyEnd: i - 1 };
}

/** Bir kademenin perklerini oku. Blok yoksa exists:false. */
function readPerks(raw, rankKey) {
    const b = findBlock(raw, rankKey);
    if (!b) return { exists: false, name: null, power: null, perks: emptyPerks() };
    const body = raw.slice(b.bodyStart, b.bodyEnd);
    const readRaw = (key) => { const mm = lineRe(key).exec(body); return mm ? mm[2] : undefined; };

    const perks = emptyPerks();
    for (const [field, def] of Object.entries(MANAGED)) {
        const rawVal = readRaw(def.key);
        if (def.type === 'bool') perks[field] = rawVal === undefined ? false : parseBool(rawVal);
        else if (def.type === 'int') perks[field] = rawVal === undefined ? null : parseIntVal(rawVal);
        else perks[field] = rawVal === undefined ? null : parseString(rawVal);
    }
    return { exists: true, name: parseString(readRaw('name')), power: parseIntVal(readRaw('power')), perks };
}

// Gövdede anahtarı ayarla (varsa değiştir, yoksa ilk satır olarak ekle).
function setLine(body, key, formattedValue, inner) {
    const re = lineRe(key);
    const line = `${inner}"${key}": ${formattedValue}`;
    if (re.test(body)) return body.replace(re, line);
    return `\n${line}${body}`;
}
// Gövdeden anahtar satırını (öncesindeki newline ile) tamamen sil.
function removeLine(body, key) {
    const k = escapeRe(key);
    return body.replace(new RegExp(`\\r?\\n[ \\t]*(?:"${k}"|${k})[ \\t]*:[^\\n]*`), '');
}

// Sıfırdan blok metni üret (eksik kademe oluştururken).
function buildBlock(rankKey, perks, meta, indent) {
    const inner = indent + '\t';
    const lines = [`${indent}${rankKey}: {`];
    lines.push(`${inner}name: ${formatString(meta?.name || rankKey)}`);
    lines.push(`${inner}power: ${Number(meta?.power) || 0}`);
    for (const [field, def] of Object.entries(MANAGED)) {
        if (!(field in perks)) continue;
        const v = perks[field];
        if (def.type === 'bool') { if (v === true) lines.push(`${inner}"${def.key}": true`); }
        else if (def.type === 'int') { if (v != null && v !== '' && Number.isFinite(Number(v))) lines.push(`${inner}"${def.key}": ${Number(v)}`); }
        else if (v) lines.push(`${inner}"${def.key}": ${formatString(String(v))}`);
    }
    lines.push(`${indent}}`);
    return lines.join('\n');
}

/**
 * Bir kademenin (yalnızca verilen) perklerini ranks.snbt metnine yaz.
 * @param perks — sadece mevcut alanlar uygulanır: bool→aç/kapa(kapatınca satır silinir),
 *                int→sayı yaz / null|'' silinir, string→yaz / boş silinir.
 * @param meta — eksik blok oluşturulurken kullanılacak { name, power }.
 */
function writePerks(raw, rankKey, perks, meta) {
    const b = findBlock(raw, rankKey);
    if (b) {
        const inner = b.indent + '\t';
        let body = raw.slice(b.bodyStart, b.bodyEnd);
        for (const field of Object.keys(perks)) {
            const def = MANAGED[field];
            if (!def) continue;
            const v = perks[field];
            if (def.type === 'bool') {
                body = v === true ? setLine(body, def.key, 'true', inner) : removeLine(body, def.key);
            } else if (def.type === 'int') {
                const ok = v != null && v !== '' && Number.isFinite(Number(v));
                body = ok ? setLine(body, def.key, String(Number(v)), inner) : removeLine(body, def.key);
            } else {
                body = v ? setLine(body, def.key, formatString(String(v)), inner) : removeLine(body, def.key);
            }
        }
        return raw.slice(0, b.bodyStart) + body + raw.slice(b.bodyEnd);
    }

    // Blok yok — ranks: { } içine yeni sibling ekle.
    const ranks = findBlock(raw, 'ranks');
    if (!ranks) throw new Error('ranks: { } bloğu bulunamadı — dosya beklenen yapıda değil.');
    const indent = ranks.indent + '\t';
    const block = buildBlock(rankKey, perks, meta, indent);
    const before = raw.slice(0, ranks.bodyEnd).replace(/\r?\n[ \t]*$/, '\n'); // kapanış girintisini at
    const after = raw.slice(ranks.bodyEnd);
    return `${before}${block}\n${ranks.indent}${after}`;
}

module.exports = { MANAGED, findBlock, readPerks, writePerks };
