/**
 * LagGuard · Decision (AIMD kontrol döngüsü)
 * ──────────────────────────────────────────
 * Lag'de SERT kıs (default → relief), stabilde TEK ADIM aç (relief → default).
 * Yön-bağımsız: relief default'tan küçük (lag'de AZALT, ör. randomTickSpeed) ya da
 * büyük (lag'de ARTIR, ör. pipez tick gecikmesi) olabilir.
 *
 * Sweet-spot (lag_ceiling): lag yapan değeri tekrar aşmaz → "aç-kıs-aç" döngüsü yok.
 * Modlar: off / dryrun (öner, uygulama) / auto (uygula).
 */
const metrics = require('./metrics');
const registry = require('./levers/registry');
const appliers = require('./levers/appliers');

const STATE = { IDLE: 'idle', NORMAL: 'normal', THROTTLING: 'throttling', COOLDOWN: 'cooldown', RECOVERING: 'recovering' };

// ── Kaldıraç yardımcıları (yön-bağımsız) ──
const dirOf = (l) => Math.sign((l.relief_value ?? l.default_value) - l.default_value); // -1 azalt, +1 artır
const fmtV = (l, v) => (l.value_type === 'float' ? Math.round(v * 1000) / 1000 : Math.round(v));
function clampRange(l, v) {
    const lo = Math.min(l.default_value, l.relief_value), hi = Math.max(l.default_value, l.relief_value);
    return Math.max(lo, Math.min(hi, v));
}
const atDefault = (l, cur) => Math.abs(cur - l.default_value) < 1e-9;
const atRelief = (l, cur) => Math.abs(cur - l.relief_value) < 1e-9;

class Decision {
    constructor() {
        this._ctx = null; this._timer = null;
        this._state = STATE.IDLE; this._lastActionAt = 0; this._stableSince = 0;
        this._log = []; this._lastSeverity = 'none';
    }
    configure(ctx) { this._ctx = ctx; }
    start() {
        this.stop();
        const interval = (this._ctx?.getSettings()?.checkInterval || 20) * 1000;
        this._timer = setInterval(() => { try { this._tick(); } catch (e) { this._addLog('error', `tick: ${e.message}`); } }, interval);
        if (this._timer.unref) this._timer.unref();
    }
    stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
    restart() { this.start(); }

    _avgMspt(n = 4) {
        const ring = metrics.getLive().ring || [];
        const recent = ring.slice(-n).map(r => r.mspt).filter(v => v != null);
        return recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    }
    _addLog(level, message) {
        this._log.push({ time: Date.now(), level, message });
        if (this._log.length > 80) this._log = this._log.slice(-80);
        console.log(`[LagGuard/decision] ${message}`);
    }

    _tick() {
        const ctx = this._ctx; if (!ctx) return;
        const mode = ctx.getMode();
        if (mode === 'off') { this._state = STATE.IDLE; return; }
        const mc = ctx.getMc();
        if (!mc || mc.status !== 'running') { this._state = STATE.IDLE; return; }

        const s = ctx.getSettings();
        const live = metrics.getLive();
        const avgMspt = this._avgMspt(4);
        if (avgMspt == null) return;
        const cantKeepUp = live.cantKeepUpCount || 0;
        const now = Date.now();

        let severity;
        if (avgMspt >= s.msptCritical || cantKeepUp >= s.cantKeepUpCritical) severity = 'critical';
        else if (avgMspt >= s.msptWarn || cantKeepUp > 0) severity = 'lag';
        else if (avgMspt <= s.msptTarget) severity = 'stable';
        else severity = 'hold';
        this._lastSeverity = severity;

        const cooldownMs = (this._state === STATE.RECOVERING ? s.cooldownAfterRecovery : s.cooldownAfterThrottle) * 1000;
        if (this._lastActionAt && now - this._lastActionAt < cooldownMs) {
            this._state = STATE.COOLDOWN;
            if (severity === 'lag' || severity === 'critical') this._stableSince = 0;
            return;
        }

        if (severity === 'critical' || severity === 'lag') {
            this._stableSince = 0;
            this._throttle(severity, avgMspt, mode, s);
        } else if (severity === 'stable') {
            if (!this._stableSince) this._stableSince = now;
            const stableFor = (now - this._stableSince) / 1000;
            if (stableFor >= s.stableForRecovery) this._recover(avgMspt, mode, stableFor, s);
            else this._state = STATE.NORMAL;
        } else { this._stableSince = 0; this._state = STATE.NORMAL; }
    }

    // ── Throttle: default → relief ───────────────────────────────────────
    _throttle(severity, mspt, mode, s) {
        const ctx = this._ctx;
        const allowRestart = !!s.allowRestartLevers;
        for (const l of registry.enabledSorted()) {
            const dir = dirOf(l);
            if (dir === 0) continue; // relief == default → anlamsız
            if (l.apply_method === 'config_restart' && !allowRestart) continue;
            const cur = registry.currentOf(l);
            if (atRelief(l, cur)) continue; // zaten relief'te

            const factor = severity === 'critical' ? 2 : 1;
            const newVal = fmtV(l, clampRange(l, cur + dir * (l.step || 1) * factor));
            if (newVal === cur) continue;

            const res = appliers.apply(l, newVal, { dryRun: mode !== 'auto', mc: ctx.getMc(), allowRestart });
            if (res.skipped) continue;
            if (mode === 'auto') { registry.setCurrent(l.id, newVal); registry.setCeiling(l.id, cur); }
            registry.logHistory({ lever_id: l.id, lever_key: l.lever_key, action: 'throttle', mode, old_value: cur, new_value: newVal, mspt_at: mspt, detail: res.detail });
            this._addLog('throttle', `${mode === 'auto' ? '⬇' : '⬇[öner]'} ${l.name}: ${cur} → ${newVal} (MSPT ${mspt.toFixed(0)}ms, ${severity})`);
            this._state = STATE.THROTTLING; this._lastActionAt = Date.now();
            return;
        }
        this._addLog('warn', `Tüm kaldıraçlar relief'te ama lag sürüyor (MSPT ${mspt.toFixed(0)}ms).`);
    }

    // ── Recover: relief → default (sweet-spot tavanına saygıyla) ─────────
    _recover(mspt, mode, stableFor, s) {
        const ctx = this._ctx;
        for (const l of registry.enabledSorted().reverse()) {
            const dir = dirOf(l);
            if (dir === 0) continue;
            const cur = registry.currentOf(l);
            if (atDefault(l, cur)) continue; // zaten normalde

            // Default'a doğru izin verilen sınır (sweet-spot tavanı)
            let cap = l.default_value;
            if (l.lag_ceiling != null) {
                cap = l.lag_ceiling + dir * (l.step || 1); // lag yapan değerin bir adım berisi
                if (stableFor >= s.stableForRecovery * 3) { cap = l.lag_ceiling; if (mode === 'auto') registry.setCeiling(l.id, null); }
            }

            let newVal;
            if (dir < 0) { // throttle azaltmıştı → recovery artırır, allowedMax = min(default, cap)
                newVal = Math.min(Math.min(l.default_value, cap), cur + (l.step || 1));
            } else {       // throttle artırmıştı → recovery azaltır, allowedMin = max(default, cap)
                newVal = Math.max(Math.max(l.default_value, cap), cur - (l.step || 1));
            }
            newVal = fmtV(l, newVal);
            if (newVal === cur) continue; // sweet-spot'ta veya default'ta

            const res = appliers.apply(l, newVal, { dryRun: mode !== 'auto', mc: ctx.getMc(), allowRestart: !!s.allowRestartLevers });
            if (res.skipped) continue;
            if (mode === 'auto') registry.setCurrent(l.id, atDefault(l, newVal) ? null : newVal);
            registry.logHistory({ lever_id: l.id, lever_key: l.lever_key, action: 'recover', mode, old_value: cur, new_value: newVal, mspt_at: mspt, detail: res.detail });
            this._addLog('recover', `${mode === 'auto' ? '⬆' : '⬆[öner]'} ${l.name}: ${cur} → ${newVal} (MSPT ${mspt.toFixed(0)}ms, stabil ${Math.round(stableFor)}s)`);
            this._state = STATE.RECOVERING; this._lastActionAt = Date.now(); this._stableSince = Date.now();
            return;
        }
        this._state = STATE.NORMAL;
    }

    resetAll(mode) {
        const ctx = this._ctx;
        let n = 0;
        for (const l of registry.list()) {
            const cur = registry.currentOf(l);
            if (atDefault(l, cur) && l.current_value == null) continue;
            const res = appliers.apply(l, l.default_value, { dryRun: mode !== 'auto', mc: ctx?.getMc?.(), allowRestart: true });
            if (mode === 'auto') { registry.setCurrent(l.id, null); registry.setCeiling(l.id, null); }
            registry.logHistory({ lever_id: l.id, lever_key: l.lever_key, action: 'reset', mode, old_value: cur, new_value: l.default_value, detail: res.detail });
            n++;
        }
        this._addLog('reset', `${n} kaldıraç default'a sıfırlandı.`);
        this._state = STATE.NORMAL;
        return n;
    }

    getState() {
        return { state: this._state, severity: this._lastSeverity, avgMspt: this._avgMspt(4),
            lastActionAt: this._lastActionAt || null, stableSince: this._stableSince || null, log: this._log.slice(-50) };
    }
}

module.exports = new Decision();
