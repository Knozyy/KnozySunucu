/**
 * LagGuard · Config Explorer
 * ──────────────────────────
 * Sunucudaki gerçek mod config dosyalarını listeler ve parse edip sayısal/boolean
 * anahtarları + GÜNCEL değerleriyle döner. Böylece kullanıcı config kaldıracı
 * eklerken yol/anahtar'ı elle yazmak yerine mevcut configten seçer.
 *
 * configParser (toml/json/properties) yeniden kullanılır.
 */
const fs = require('fs');
const path = require('path');
const ConfigParser = require('../configParser');

const MAX_FILES = 800;
const MAX_DEPTH = 4;
const SKIP_DIRS = new Set(['defaultconfigs', 'backups', '.git', 'cache']);

function guessFormat(file) {
    const f = file.toLowerCase();
    if (f.endsWith('.toml')) return 'toml';
    if (f.endsWith('.json') || f.endsWith('.json5')) return 'json';
    if (f.endsWith('.properties') || f.endsWith('.cfg')) return 'properties';
    return null;
}

// serverPath dışına çıkışı engelle (path traversal koruması)
function safeResolve(serverPath, rel) {
    const base = path.resolve(serverPath);
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) {
        throw new Error('Geçersiz yol');
    }
    return abs;
}

function walk(dir, base, depth, out) {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (out.length >= MAX_FILES) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
            walk(full, base, depth + 1, out);
        } else {
            const fmt = guessFormat(e.name);
            if (fmt) out.push({ path: path.relative(base, full).split(path.sep).join('/'), format: fmt });
        }
    }
}

const explorer = {
    /** Paketin config/ klasörü (+ kök server.properties). world/serverconfig KULLANILMAZ. */
    listFiles(serverPath) {
        if (!serverPath || !fs.existsSync(serverPath)) return [];
        const out = [];
        const configDir = path.join(serverPath, 'config');
        if (fs.existsSync(configDir)) walk(configDir, serverPath, 0, out);
        // Kök seviyesindeki yaygın dosyalar
        for (const f of ['server.properties']) {
            if (fs.existsSync(path.join(serverPath, f))) out.push({ path: f, format: 'properties' });
        }
        out.sort((a, b) => a.path.localeCompare(b.path));
        return out;
    },

    /** Bir config dosyasını parse edip sayısal/boolean anahtarları döndür. */
    read(serverPath, rel) {
        const abs = safeResolve(serverPath, rel);
        const format = guessFormat(abs);
        if (!format) throw new Error('Desteklenmeyen format');
        const { data } = ConfigParser.read(abs, format);
        const entries = [];
        flatten(data, '', entries);
        return { path: rel, format, entries };
    },
};

// İç içe objeyi dot-notation anahtar → değer'e indir (yalnızca number/boolean)
function flatten(obj, prefix, out, depth = 0) {
    if (depth > 8 || out.length > 2000) return;
    if (obj == null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'number') {
            out.push({ key, value: v, type: 'number' });
        } else if (typeof v === 'boolean') {
            out.push({ key, value: v ? 1 : 0, type: 'boolean' });
        } else if (typeof v === 'string') {
            // properties dosyalarında sayılar string gelir → sayıya çevrilebiliyorsa al
            const n = Number(v);
            if (v.trim() !== '' && Number.isFinite(n)) out.push({ key, value: n, type: 'number' });
            else if (v === 'true' || v === 'false') out.push({ key, value: v === 'true' ? 1 : 0, type: 'boolean' });
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            flatten(v, key, out, depth + 1);
        }
    }
}

module.exports = explorer;
