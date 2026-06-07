/**
 * LagGuard · Lever Appliers
 * ─────────────────────────
 * Bir kaldıracın değerini, apply_method'una göre uygular:
 *   gamerule / command  → canlı komut (mc.sendCommand)
 *   config_reload       → config dosyasını düzenle + reload komutu (canlı, mod destekliyorsa)
 *   config_restart      → config dosyasını düzenle (etki sonraki restart'ta) — toggle ile gated
 *
 * Not: configParser eski WIP'ten gelen genel bir yardımcı; yeniden kullanıyoruz.
 */
const path = require('path');

function fmt(value, valueType) {
    if (valueType === 'int') return Math.round(value);
    return Math.round(value * 1000) / 1000;
}

function buildCommand(lever, value) {
    const v = fmt(value, lever.value_type);
    if (lever.apply_template && lever.apply_template.includes('{value}')) {
        return lever.apply_template.replace(/\{value\}/g, String(v));
    }
    return `${lever.apply_template || ''} ${v}`.trim();
}

/**
 * @returns {{ ok, applied, skipped?, cmd?, detail }}
 */
function apply(lever, value, { dryRun = true, mc = null, allowRestart = false } = {}) {
    const v = fmt(value, lever.value_type);
    const method = lever.apply_method || 'gamerule';

    // ── Canlı komut yöntemleri ──
    if (method === 'gamerule' || method === 'command') {
        const cmd = buildCommand(lever, v);
        if (dryRun) return { ok: true, applied: false, cmd, detail: `[öner] ${cmd}` };
        try {
            mc.sendCommand(cmd);
            return { ok: true, applied: true, cmd, detail: cmd };
        } catch (e) {
            return { ok: false, applied: false, cmd, detail: `komut hatası: ${e.message}` };
        }
    }

    // ── Config dosyası yöntemleri ──
    if (method === 'config_reload' || method === 'config_restart') {
        if (method === 'config_restart' && !allowRestart) {
            return { ok: false, applied: false, skipped: true, detail: 'restart gerektiren kaldıraç (toggle kapalı)' };
        }
        if (dryRun) {
            return { ok: true, applied: false, detail: `[öner] ${lever.config_path}:${lever.config_key} = ${v}` };
        }
        try {
            const ConfigParser = require('../../configParser');
            const serverPath = mc?.getServerPath ? mc.getServerPath() : '';
            const fmtName = lever.config_format || 'toml';
            const filePath = path.isAbsolute(lever.config_path)
                ? lever.config_path
                : path.join(serverPath, lever.config_path);

            // Yazmadan önceki değer
            let before;
            try { before = ConfigParser.getValue(ConfigParser.read(filePath, fmtName).data, lever.config_key); } catch { /* ignore */ }

            ConfigParser.setValue(filePath, fmtName, lever.config_key, v);

            // Yazdıktan sonra TEKRAR OKU ve gerçekten değişti mi doğrula
            let after;
            try { after = ConfigParser.getValue(ConfigParser.read(filePath, fmtName).data, lever.config_key); } catch { /* ignore */ }
            const verified = after != null && Number(after) === Number(v);

            if (method === 'config_reload' && lever.reload_command) {
                try { mc.sendCommand(lever.reload_command); } catch { /* ignore */ }
            }
            const note = method === 'config_restart' ? ' (sonraki restart\'ta etkin)' : '';

            if (!verified) {
                return { ok: false, applied: false, detail: `YAZILDI AMA DOĞRULANAMADI → ${filePath} · ${lever.config_key}: ${before} → beklenen ${v}, dosyada ${after}` };
            }
            return { ok: true, applied: true, detail: `${filePath} · ${lever.config_key}: ${before} → ${v}${note}` };
        } catch (e) {
            return { ok: false, applied: false, detail: `config hatası: ${e.message}` };
        }
    }

    return { ok: false, applied: false, detail: `bilinmeyen yöntem: ${method}` };
}

module.exports = { apply, buildCommand };
