/**
 * AutoThrottle Service
 * ─────────────────────
 * TPS/MSPT izler, lag algılandığında mod config'lerini kademeli olarak kısar,
 * performans düzeldiğinde yavaşça geri açar (sweet-spot bulma).
 *
 * Katmanlar:
 *   1. Algılama  — TPS geçmişi + lag seviye hesaplama
 *   2. Karar     — Throttle / Recovery / Bekleme durumu
 *   3. Uygulama  — Config dosyası düzenleme + reload komutu
 */
const { getDb } = require('../db/database');
const ConfigParser = require('./configParser');
const path = require('path');
const EventEmitter = require('events');

// ── Varsayılan eşikler ──────────────────────────────────────────────────
const DEFAULTS = {
    tpsNormal:      19,   // TPS ≥ bu → recovery moduna geç
    tpsWarn:        16,   // TPS < bu → throttle başlasın
    tpsCritical:    12,   // TPS < bu → agresif throttle
    checkInterval:  30,   // Kaç saniyede bir kontrol (sn)
    cooldownAfterThrottle: 120, // Throttle sonrası bekleme (sn)
    cooldownAfterRecovery: 180, // Recovery adımı sonrası bekleme (sn)
    stableTimeForRecovery: 300, // Recovery başlamak için stabil süre (sn)
    tpsHistorySize: 20,   // TPS ring buffer boyutu
};

// ── Durum enum ──────────────────────────────────────────────────────────
const State = {
    IDLE:       'idle',       // Profil yok veya sistem kapalı
    NORMAL:     'normal',     // TPS iyi, değişiklik yok
    THROTTLING: 'throttling', // Aktif olarak kısıyor
    COOLDOWN:   'cooldown',   // Son throttle/recovery sonrası bekleme
    RECOVERING: 'recovering', // Kademeli geri açma
};

class AutoThrottle extends EventEmitter {
    constructor() {
        super();
        this._state = State.IDLE;
        this._enabled = false;
        this._tpsHistory = [];           // Son N TPS ölçümü
        this._lastThrottleAt = 0;
        this._lastRecoveryAt = 0;
        this._stableSince = 0;           // TPS'in stabil olduğu timestamp
        this._checkTimer = null;
        this._settings = { ...DEFAULTS };
        this._log = [];                  // Son 100 log
        this._mcService = null;
        this._cantKeepUpCount = 0;       // Son 5 dk'daki "Can't keep up" sayısı
        this._cantKeepUpTimes = [];      // Zamanlar
        this._loadSettings();
    }

    // ── Başlatma / Durdurma ─────────────────────────────────────────────

    /**
     * MinecraftService referansını bağla ve izlemeye başla
     */
    attach(mcService) {
        this._mcService = mcService;
        // Settings'den enabled kontrolü
        if (this._enabled) {
            this._startMonitoring();
        }
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        this._saveSetting('autothrottle_enabled', enabled ? '1' : '0');
        if (enabled && this._mcService) {
            this._startMonitoring();
        } else {
            this._stopMonitoring();
        }
        this._addLog('system', enabled ? 'AutoThrottle aktif edildi' : 'AutoThrottle durduruldu');
    }

    _startMonitoring() {
        if (this._checkTimer) return;
        this._state = State.NORMAL;
        this._checkTimer = setInterval(() => this._tick(), this._settings.checkInterval * 1000);
        this._addLog('system', `İzleme başlatıldı (her ${this._settings.checkInterval}sn)`);
    }

    _stopMonitoring() {
        if (this._checkTimer) {
            clearInterval(this._checkTimer);
            this._checkTimer = null;
        }
        this._state = State.IDLE;
    }

    // ── TPS Verisi ──────────────────────────────────────────────────────

    /**
     * MinecraftService'ten TPS güncellemesi al
     */
    feedTps(tps) {
        if (tps == null) return;
        this._tpsHistory.push({ tps, time: Date.now() });
        if (this._tpsHistory.length > this._settings.tpsHistorySize) {
            this._tpsHistory.shift();
        }
    }

    /**
     * "Can't keep up" mesajı algılandığında çağrılır
     */
    feedCantKeepUp(behindMs) {
        const now = Date.now();
        this._cantKeepUpTimes.push(now);
        // Son 5 dk'yı tut
        const fiveMinAgo = now - 300_000;
        this._cantKeepUpTimes = this._cantKeepUpTimes.filter(t => t > fiveMinAgo);
        this._cantKeepUpCount = this._cantKeepUpTimes.length;
    }

    _getAvgTps(lastN = 5) {
        const recent = this._tpsHistory.slice(-lastN);
        if (recent.length === 0) return null;
        return recent.reduce((sum, e) => sum + e.tps, 0) / recent.length;
    }

    _getMinTps(lastN = 3) {
        const recent = this._tpsHistory.slice(-lastN);
        if (recent.length === 0) return null;
        return Math.min(...recent.map(e => e.tps));
    }

    // ── Ana Döngü ───────────────────────────────────────────────────────

    _tick() {
        if (!this._enabled || !this._mcService) return;
        if (this._mcService.status !== 'running') return;

        const avgTps = this._getAvgTps(5);
        const minTps = this._getMinTps(3);
        if (avgTps == null) return; // Henüz veri yok

        const now = Date.now();
        const s = this._settings;

        // Cooldown kontrolü
        if (this._state === State.COOLDOWN) {
            const cooldownMs = (this._lastThrottleAt > this._lastRecoveryAt)
                ? s.cooldownAfterThrottle * 1000
                : s.cooldownAfterRecovery * 1000;
            const elapsed = now - Math.max(this._lastThrottleAt, this._lastRecoveryAt);
            if (elapsed < cooldownMs) return; // Beklemeye devam
            this._state = State.NORMAL;
        }

        // ── THROTTLE kararı ─────────────────────────────────────────────
        if (avgTps < s.tpsWarn || minTps < s.tpsCritical) {
            this._stableSince = 0;
            const severity = avgTps < s.tpsCritical ? 'critical' : 'warn';
            this._performThrottle(avgTps, severity);
            return;
        }

        // ── RECOVERY kararı ─────────────────────────────────────────────
        if (avgTps >= s.tpsNormal) {
            if (!this._stableSince) {
                this._stableSince = now;
            }
            const stableFor = (now - this._stableSince) / 1000;

            if (stableFor >= s.stableTimeForRecovery) {
                this._performRecovery(avgTps);
            }
        } else {
            // TPS normal ile warn arasında — recovery yapma ama stabil saymaya da başlama
            this._stableSince = 0;
        }
    }

    // ── Throttle Uygulama ───────────────────────────────────────────────

    _performThrottle(currentTps, severity) {
        const profiles = this._getEnabledProfiles();
        if (profiles.length === 0) return;

        let throttled = false;
        // Priority sırasıyla (düşük = önce kısılır)
        for (const profile of profiles) {
            const rules = this._getRulesForProfile(profile.id);
            for (const rule of rules) {
                const current = this._getCurrentValue(rule);
                const minVal = parseFloat(rule.min_value);
                const step = severity === 'critical' ? rule.step_down * 2 : rule.step_down;

                if (current <= minVal) continue; // Zaten minimum

                const newVal = Math.max(minVal, current - step);
                if (newVal === current) continue;

                try {
                    const serverPath = this._getServerPath(profile.server_id);
                    const configPath = path.join(serverPath, profile.config_path);
                    ConfigParser.setValue(configPath, profile.config_format, rule.config_key, newVal);

                    // DB güncelle
                    this._updateCurrentValue(rule.id, newVal);
                    this._logHistory(profile.id, rule.id, 'throttle', current, newVal, currentTps);
                    this._addLog(profile.name, `⬇ ${rule.config_key}: ${current} → ${newVal} (TPS: ${currentTps.toFixed(1)})`);
                    throttled = true;
                } catch (err) {
                    this._addLog(profile.name, `HATA: ${rule.config_key} değiştirilemedi — ${err.message}`);
                }
            }

            // Reload komutu
            if (throttled && profile.reload_command) {
                try {
                    this._mcService.sendCommand(profile.reload_command);
                    this._addLog(profile.name, `Reload komutu gönderildi: ${profile.reload_command}`);
                } catch { /* ignore */ }
            }

            if (throttled) break; // Bir seferde sadece 1 profil kıs (kademeli)
        }

        if (throttled) {
            this._state = State.COOLDOWN;
            this._lastThrottleAt = Date.now();
            this.emit('throttle', { tps: currentTps, severity });
        }
    }

    // ── Recovery Uygulama ───────────────────────────────────────────────

    _performRecovery(currentTps) {
        const profiles = this._getEnabledProfiles();
        if (profiles.length === 0) return;

        let recovered = false;
        // Ters priority sırasıyla (yüksek = en son kısılan = ilk açılan)
        const reversed = [...profiles].reverse();

        for (const profile of reversed) {
            const rules = this._getRulesForProfile(profile.id);
            for (const rule of rules) {
                const current = this._getCurrentValue(rule);
                const defaultVal = parseFloat(rule.default_value);

                if (current >= defaultVal) continue; // Zaten default

                const newVal = Math.min(defaultVal, current + rule.step_up);
                if (newVal === current) continue;

                try {
                    const serverPath = this._getServerPath(profile.server_id);
                    const configPath = path.join(serverPath, profile.config_path);
                    ConfigParser.setValue(configPath, profile.config_format, rule.config_key, newVal);

                    this._updateCurrentValue(rule.id, newVal);
                    this._logHistory(profile.id, rule.id, 'recover', current, newVal, currentTps);
                    this._addLog(profile.name, `⬆ ${rule.config_key}: ${current} → ${newVal} (TPS: ${currentTps.toFixed(1)})`);
                    recovered = true;
                } catch (err) {
                    this._addLog(profile.name, `HATA: ${rule.config_key} geri açılamadı — ${err.message}`);
                }
            }

            if (recovered && profile.reload_command) {
                try {
                    this._mcService.sendCommand(profile.reload_command);
                } catch { /* ignore */ }
            }

            if (recovered) break; // Bir seferde sadece 1 profil aç
        }

        if (recovered) {
            this._state = State.COOLDOWN;
            this._lastRecoveryAt = Date.now();
            this._stableSince = 0; // Stabil sayacı sıfırla
            this.emit('recovery', { tps: currentTps });
        }
    }

    // ── Tüm Profilleri Sıfırla ──────────────────────────────────────────

    resetAll() {
        const profiles = this._getAllProfiles();
        let resetCount = 0;

        for (const profile of profiles) {
            const rules = this._getRulesForProfile(profile.id);
            for (const rule of rules) {
                if (rule.current_value == null) continue;

                const current = parseFloat(rule.current_value);
                const defaultVal = parseFloat(rule.default_value);
                if (current === defaultVal) continue;

                try {
                    const serverPath = this._getServerPath(profile.server_id);
                    const configPath = path.join(serverPath, profile.config_path);
                    ConfigParser.setValue(configPath, profile.config_format, rule.config_key, defaultVal);
                    this._updateCurrentValue(rule.id, null);
                    this._logHistory(profile.id, rule.id, 'reset', current, defaultVal, null);
                    resetCount++;
                } catch (err) {
                    this._addLog(profile.name, `HATA: ${rule.config_key} sıfırlanamadı — ${err.message}`);
                }
            }

            if (profile.reload_command) {
                try { this._mcService?.sendCommand(profile.reload_command); } catch { /* ignore */ }
            }
        }

        this._addLog('system', `Tüm profiller sıfırlandı (${resetCount} değer default'a döndürüldü)`);
        return resetCount;
    }

    // ── Durum & Log ─────────────────────────────────────────────────────

    getStatus() {
        const avgTps = this._getAvgTps(5);
        const profiles = this._getAllProfiles();
        let totalThrottled = 0;
        let totalRules = 0;

        for (const p of profiles) {
            const rules = this._getRulesForProfile(p.id);
            for (const r of rules) {
                totalRules++;
                if (r.current_value != null && parseFloat(r.current_value) < parseFloat(r.default_value)) {
                    totalThrottled++;
                }
            }
        }

        return {
            enabled: this._enabled,
            state: this._state,
            avgTps: avgTps != null ? Math.round(avgTps * 10) / 10 : null,
            tpsHistory: this._tpsHistory.slice(-20),
            cantKeepUpCount: this._cantKeepUpCount,
            totalProfiles: profiles.length,
            totalRules,
            totalThrottled,
            settings: this._settings,
            lastThrottleAt: this._lastThrottleAt || null,
            lastRecoveryAt: this._lastRecoveryAt || null,
            stableSince: this._stableSince || null,
        };
    }

    getLog() {
        return this._log.slice(-50);
    }

    getHistory(limit = 50) {
        try {
            const db = getDb();
            return db.prepare(`
                SELECT h.*, p.name as profile_name, r.config_key, r.description as rule_desc
                FROM throttle_history h
                LEFT JOIN throttle_profiles p ON h.profile_id = p.id
                LEFT JOIN throttle_rules r ON h.rule_id = r.id
                ORDER BY h.occurred_at DESC
                LIMIT ?
            `).all(limit);
        } catch { return []; }
    }

    // ── Profil CRUD ─────────────────────────────────────────────────────

    _getAllProfiles() {
        try {
            const db = getDb();
            return db.prepare('SELECT * FROM throttle_profiles ORDER BY priority ASC').all();
        } catch { return []; }
    }

    _getEnabledProfiles() {
        try {
            const db = getDb();
            return db.prepare('SELECT * FROM throttle_profiles WHERE enabled = 1 ORDER BY priority ASC').all();
        } catch { return []; }
    }

    getProfiles() {
        const profiles = this._getAllProfiles();
        return profiles.map(p => ({
            ...p,
            rules: this._getRulesForProfile(p.id),
        }));
    }

    createProfile(data) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO throttle_profiles (name, priority, enabled, config_path, config_format, reload_command, server_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            data.name, data.priority || 1, data.enabled !== false ? 1 : 0,
            data.configPath, data.configFormat || 'toml',
            data.reloadCommand || null, data.serverId || null
        );

        const profileId = result.lastInsertRowid;

        // Kuralları ekle
        if (data.rules && data.rules.length > 0) {
            const stmt = db.prepare(`
                INSERT INTO throttle_rules (profile_id, config_key, description, value_type, default_value, min_value, step_down, step_up)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const rule of data.rules) {
                stmt.run(profileId, rule.configKey, rule.description || '',
                    rule.valueType || 'number', String(rule.defaultValue), String(rule.minValue),
                    rule.stepDown || 1, rule.stepUp || 1);
            }
        }

        this._addLog('system', `Profil oluşturuldu: "${data.name}" (${data.configPath})`);
        return this.getProfiles().find(p => p.id === Number(profileId));
    }

    updateProfile(id, data) {
        const db = getDb();
        db.prepare(`
            UPDATE throttle_profiles
            SET name = ?, priority = ?, enabled = ?, config_path = ?, config_format = ?, reload_command = ?
            WHERE id = ?
        `).run(data.name, data.priority || 1, data.enabled !== false ? 1 : 0,
            data.configPath, data.configFormat || 'toml',
            data.reloadCommand || null, id);

        // Kuralları güncelle (sil + yeniden ekle)
        if (data.rules) {
            db.prepare('DELETE FROM throttle_rules WHERE profile_id = ?').run(id);
            const stmt = db.prepare(`
                INSERT INTO throttle_rules (profile_id, config_key, description, value_type, default_value, min_value, step_down, step_up, current_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const rule of data.rules) {
                stmt.run(id, rule.configKey, rule.description || '',
                    rule.valueType || 'number', String(rule.defaultValue), String(rule.minValue),
                    rule.stepDown || 1, rule.stepUp || 1, rule.currentValue || null);
            }
        }

        this._addLog('system', `Profil güncellendi: "${data.name}"`);
    }

    deleteProfile(id) {
        const db = getDb();
        const profile = db.prepare('SELECT * FROM throttle_profiles WHERE id = ?').get(id);
        db.prepare('DELETE FROM throttle_rules WHERE profile_id = ?').run(id);
        db.prepare('DELETE FROM throttle_profiles WHERE id = ?').run(id);
        if (profile) this._addLog('system', `Profil silindi: "${profile.name}"`);
    }

    toggleProfile(id) {
        const db = getDb();
        const profile = db.prepare('SELECT * FROM throttle_profiles WHERE id = ?').get(id);
        if (!profile) throw new Error('Profil bulunamadı');
        const newEnabled = profile.enabled ? 0 : 1;
        db.prepare('UPDATE throttle_profiles SET enabled = ? WHERE id = ?').run(newEnabled, id);
        this._addLog(profile.name, newEnabled ? 'Profil aktif edildi' : 'Profil durduruldu');
        return { enabled: !!newEnabled };
    }

    // ── Settings ────────────────────────────────────────────────────────

    getSettings() {
        return { ...this._settings };
    }

    updateSettings(newSettings) {
        for (const [key, val] of Object.entries(newSettings)) {
            if (key in this._settings) {
                this._settings[key] = Number(val);
                this._saveSetting(`at_${key}`, String(val));
            }
        }
        // checkInterval değiştiyse timer'ı yeniden başlat
        if (newSettings.checkInterval && this._checkTimer) {
            this._stopMonitoring();
            this._startMonitoring();
        }
        this._addLog('system', 'Ayarlar güncellendi');
    }

    // ── Dahili Yardımcılar ──────────────────────────────────────────────

    _getRulesForProfile(profileId) {
        try {
            const db = getDb();
            return db.prepare('SELECT * FROM throttle_rules WHERE profile_id = ?').all(profileId);
        } catch { return []; }
    }

    _getCurrentValue(rule) {
        if (rule.current_value != null) return parseFloat(rule.current_value);
        return parseFloat(rule.default_value);
    }

    _updateCurrentValue(ruleId, value) {
        try {
            const db = getDb();
            db.prepare('UPDATE throttle_rules SET current_value = ? WHERE id = ?')
                .run(value != null ? String(value) : null, ruleId);
        } catch { /* ignore */ }
    }

    _logHistory(profileId, ruleId, action, oldVal, newVal, tps) {
        try {
            const db = getDb();
            db.prepare(`
                INSERT INTO throttle_history (profile_id, rule_id, action, old_value, new_value, tps_at_time)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(profileId, ruleId, action, String(oldVal), String(newVal), tps);
        } catch { /* ignore */ }
    }

    _getServerPath(serverId) {
        try {
            const serverRegistry = require('./serverRegistry');
            const mc = serverId ? serverRegistry.get(serverId) : serverRegistry.getDefault();
            if (mc && typeof mc.getServerPath === 'function') return mc.getServerPath();
        } catch { /* fallback */ }
        return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    _addLog(source, message) {
        const entry = { time: new Date().toISOString(), source, message };
        this._log.push(entry);
        if (this._log.length > 100) this._log = this._log.slice(-100);
        console.log(`[AutoThrottle] [${source}] ${message}`);
    }

    _loadSettings() {
        try {
            const db = getDb();
            // Enabled durumunu yükle
            const enabledRow = db.prepare("SELECT value FROM app_settings WHERE key = 'autothrottle_enabled'").get();
            this._enabled = enabledRow ? enabledRow.value === '1' : false;

            // Eşik ayarlarını yükle
            for (const key of Object.keys(DEFAULTS)) {
                const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`at_${key}`);
                if (row) this._settings[key] = Number(row.value);
            }
        } catch { /* ilk çalıştırmada tablo olmayabilir */ }
    }

    _saveSetting(key, value) {
        try {
            const db = getDb();
            db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`)
                .run(key, value, value);
        } catch { /* ignore */ }
    }
}

module.exports = new AutoThrottle();
