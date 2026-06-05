/**
 * Config Parser Utility
 * TOML, JSON ve Properties formatlarında config dosyalarını okuma/yazma
 * Değer değiştirirken mümkün olduğunca orijinal formatı ve yorumları korur.
 */
const fs = require('fs');
const path = require('path');
const TOML = require('smol-toml');

class ConfigParser {

    /**
     * Config dosyasını oku ve parse et
     * @param {string} filePath — Mutlak yol
     * @param {string} format — 'toml' | 'json' | 'properties'
     * @returns {{ data: object, raw: string }}
     */
    static read(filePath, format) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Config dosyası bulunamadı: ${filePath}`);
        }
        const raw = fs.readFileSync(filePath, 'utf-8');

        switch (format) {
            case 'toml':
                return { data: TOML.parse(raw), raw };
            case 'json':
                return { data: JSON.parse(raw), raw };
            case 'properties':
                return { data: ConfigParser._parseProperties(raw), raw };
            default:
                throw new Error(`Desteklenmeyen format: ${format}`);
        }
    }

    /**
     * Dot-notation key path ile config'den değer oku
     * @param {object} data — Parse edilmiş config objesi
     * @param {string} keyPath — Örn: "kinetics.maxStressCapacity"
     * @returns {*} Değer
     */
    static getValue(data, keyPath) {
        const keys = keyPath.split('.');
        let current = data;
        for (const key of keys) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[key];
        }
        return current;
    }

    /**
     * Config dosyasındaki belirli bir key'in değerini değiştir (metin tabanlı, format koruyucu)
     * @param {string} filePath — Mutlak yol
     * @param {string} format — 'toml' | 'json' | 'properties'
     * @param {string} keyPath — Dot-notation key (e.g., "general.tickRate")
     * @param {*} newValue — Yeni değer
     * @returns {{ success: boolean, oldValue: *, newValue: * }}
     */
    static setValue(filePath, format, keyPath, newValue) {
        const { data, raw } = ConfigParser.read(filePath, format);
        const oldValue = ConfigParser.getValue(data, keyPath);

        if (oldValue === undefined) {
            throw new Error(`Key bulunamadı: "${keyPath}" (dosya: ${path.basename(filePath)})`);
        }

        let newRaw;
        switch (format) {
            case 'toml':
                newRaw = ConfigParser._setTomlValue(raw, keyPath, oldValue, newValue);
                break;
            case 'json':
                newRaw = ConfigParser._setJsonValue(raw, data, keyPath, newValue);
                break;
            case 'properties':
                newRaw = ConfigParser._setPropertiesValue(raw, keyPath, newValue);
                break;
            default:
                throw new Error(`Desteklenmeyen format: ${format}`);
        }

        // Backup oluştur (ilk kez değiştiriyorsa)
        const backupPath = filePath + '.autothrottle.bak';
        if (!fs.existsSync(backupPath)) {
            fs.writeFileSync(backupPath, raw, 'utf-8');
        }

        fs.writeFileSync(filePath, newRaw, 'utf-8');
        return { success: true, oldValue, newValue };
    }

    /**
     * Backup'tan orijinal config'i geri yükle
     * @param {string} filePath — Config dosyası yolu
     * @returns {boolean} Geri yüklendi mi
     */
    static restoreBackup(filePath) {
        const backupPath = filePath + '.autothrottle.bak';
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, filePath);
            fs.unlinkSync(backupPath);
            return true;
        }
        return false;
    }

    // ── TOML ──────────────────────────────────────────────────────────────

    /**
     * TOML dosyasında key'in değerini text tabanlı değiştir (yorumları korur)
     */
    static _setTomlValue(raw, keyPath, oldValue, newValue) {
        const parts = keyPath.split('.');
        const leafKey = parts[parts.length - 1];

        // Strateji: key = value satırını bul ve value kısmını değiştir
        // Section header'ları da dikkate al
        const lines = raw.split(/\r?\n/);
        let currentSection = '';
        const targetSection = parts.length > 1 ? parts.slice(0, -1).join('.') : '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Section header: [section] veya [section.subsection]
            const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
            if (sectionMatch) {
                currentSection = sectionMatch[1].trim();
                continue;
            }

            // Boş satır veya yorum
            if (!trimmed || trimmed.startsWith('#')) continue;

            // Key = value satırı mı?
            const kvMatch = line.match(/^(\s*)([\w\-.]+)\s*=\s*(.*)/);
            if (!kvMatch) continue;

            const indent = kvMatch[1];
            const key = kvMatch[2];
            const existingValueStr = kvMatch[3];

            // Doğru section ve key mi?
            const fullKey = currentSection ? `${currentSection}.${key}` : key;
            if (fullKey === keyPath || key === leafKey && currentSection === targetSection) {
                // Yorum varsa koru
                const commentMatch = existingValueStr.match(/(#.*)$/);
                const comment = commentMatch ? ' ' + commentMatch[1] : '';
                const formattedValue = ConfigParser._formatTomlValue(newValue);
                lines[i] = `${indent}${key} = ${formattedValue}${comment}`;
                return lines.join('\n');
            }
        }

        throw new Error(`TOML key bulunamadı: "${keyPath}"`);
    }

    static _formatTomlValue(value) {
        if (typeof value === 'number') return String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'string') return `"${value}"`;
        return String(value);
    }

    // ── JSON ──────────────────────────────────────────────────────────────

    static _setJsonValue(raw, data, keyPath, newValue) {
        const keys = keyPath.split('.');
        let current = data;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = newValue;

        // Indent'i tahmin et (orijinal dosyadan)
        const indentMatch = raw.match(/\n(\s+)/);
        const indent = indentMatch ? indentMatch[1].length : 2;
        return JSON.stringify(data, null, indent) + '\n';
    }

    // ── Properties ────────────────────────────────────────────────────────

    static _parseProperties(raw) {
        const data = {};
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim();
            data[key] = val;
        }
        return data;
    }

    static _setPropertiesValue(raw, key, newValue) {
        const lines = raw.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('#') || trimmed.startsWith('!') || !trimmed) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const k = trimmed.substring(0, eqIdx).trim();
            if (k === key) {
                lines[i] = `${k}=${newValue}`;
                return lines.join('\n');
            }
        }
        throw new Error(`Properties key bulunamadı: "${key}"`);
    }
}

module.exports = ConfigParser;
