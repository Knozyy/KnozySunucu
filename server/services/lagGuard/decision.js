/**
 * LagGuard · Decision (AIMD kontrol döngüsü)
 * ──────────────────────────────────────────
 * Lag'de SERT kıs (multiplicative decrease), stabilde TEK ADIM aç (additive
 * increase) → TCP tıkanıklık kontrolü mantığı. Sweet-spot: bir değer lag yaptıysa
 * (lag_ceiling) recovery onu aşmaz; böylece "aç-kıs-aç" sonsuz döngüsü olmaz.
 *
 * Modlar:  off → hiçbir şey yapma · dryrun → ne yapacağını logla (uygulama) ·
 *          auto → gerçekten uygula.
 */
const metrics = require('./metrics');
const registry = require('./levers/registry');
const appliers = require('./levers/appliers');

const STATE = { IDLE: 'idle', NORMAL: 'normal', THROTTLING: 'throttling', COOLDOWN: 'cooldown', RECOVERING: 'recovering' };

class Decision {
    constructor() {
        this._ctx = null;
        this._timer = null;
        this._state = STATE.IDLE;
        this._lastActionAt = 0;
        this._stableSince = 0;
        this._log = [];
        this._lastSeverity = 'none';
    }

    configure(ctx) { this._ctx = ctx; }

    start() {
        this.stop();
        const interval = (this._ctx?.getSettings()?.checkInterval || 20) * 1000;
        this._timer = setInterval(() => {
            try { this._tick(); } catch (e) { this._addLog('error', `tick hatası: ${e.message}`); }
        }, interval);
        if (this._timer.unref) this._timer.unref();
    }

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    restart() { this.start(); }

    // ── Yardımcılar ──────────────────────────────────────────────────────
    _avgMspt(n = 4) {
        const ring = metrics.getLive().ring || [];
        const recent = ring.slice(-n).map(r => r.mspt).filter(v => v != null);
        if (!recent.length) return null;
        return recent.reduce((a, b) => a + b, 0) / recent.length;
    }

    _addLog(level, message) {
        const entry = { time: Date.now(), level, message };
        this._log.push(entry);
        if (this._log.length > 80) this._log = this._log.slice(-80);
        console.log(`[LagGuard/decision] ${message}`);
    }

    // ── Ana döngü ────────────────────────────────────────────────────────
    _tick() {
        const ctx = this._ctx;
        if (!ctx) return;
        const mode = ctx.getMode();
        if (mode === 'off') { this._state = STATE.IDLE; return; }

        const mc = ctx.getMc();
        if (!mc || mc.status !== 'running') { this._state = STATE.IDLE; return; }

        const s = ctx.getSettings();
        const live = metrics.getLive();
        const avgMspt = this._avgMspt(4);
        if (avgMspt == null) return; // veri yok

        const cantKeepUp = live.cantKeepUpCount || 0;
        const now = Date.now();

        // Şiddet tespiti (MSPT birincil + Can't keep up)
        let severity;
        if (avgMspt >= s.msptCritical || cantKeepUp >= s.cantKeepUpCritical) severity = 'critical';
        else if (avgMspt >= s.msptWarn || cantKeepUp > 0) severity = 'lag';
        else if (avgMspt <= s.msptTarget) severity = 'stable';
        else severity = 'hold';
        this._lastSeverity = severity;

        // Cooldown
        const sinceAction = now - this._lastActionAt;
        const cooldownMs = (this._state === STATE.RECOVERING ? s.cooldownAfterRecovery : s.cooldownAfterThrottle) * 1000;
        if (this._lastActionAt && sinceAction < cooldownMs) {
            this._state = STATE.COOLDOWN;
            if (severity === 'lag' || severity === 'critical') this._stableSince = 0;
            return;
        }

        if (severity === 'critical' || severity === 'lag') {
            this._stableSince = 0;
            this._throttle(severity, avgMspt, mode);
        } else if (severity === 'stable') {
            if (!this._stableSince) this._stableSince = now;
            const stableFor = (now - this._stableSince) / 1000;
            if (stableFor >= s.stableForRecovery) {
                this._recover(avgMspt, mode, stableFor, s);
            } else {
                this._state = STATE.NORMAL;
            }
        } else {
            // hold (target ile warn arası): ne kıs ne aç
            this._stableSince = 0;
            this._state = STATE.NORMAL;
        }
    }

    // ── Throttle (kıs) ───────────────────────────────────────────────────
    _throttle(severity, mspt, mode) {
        const ctx = this._ctx;
        const levers = registry.enabledSorted();
        const allowRestart = !!ctx.getSettings().allowRestartLevers;

        for (const lever of levers) {
            if (lever.apply_method === 'config_restart' && !allowRestart) continue;
            const cur = registry.currentOf(lever);
            if (cur <= lever.min_value) continue; // zaten minimumda

            const factor = severity === 'critical' ? 2 : 1;
            const newVal = Math.max(lever.min_value, cur - lever.step_down * factor);
            if (newVal === cur) continue;

            const res = appliers.apply(lever, newVal, { dryRun: mode !== 'auto', mc: ctx.getMc(), allowRestart });
            if (res.skipped) continue;

            if (mode === 'auto') {
                registry.setCurrent(lever.id, newVal);
                // Sweet-spot: bu (eski) değer lag yapıyordu → recovery tavanı
                registry.setCeiling(lever.id, cur);
            }
            registry.logHistory({
                lever_id: lever.id, lever_key: lever.lever_key, action: 'throttle', mode,
                old_value: cur, new_value: newVal, mspt_at: mspt, detail: res.detail,
            });
            this._addLog('throttle', `${mode === 'auto' ? '⬇' : '⬇[öner]'} ${lever.name}: ${cur} → ${newVal} (MSPT ${mspt.toFixed(0)}ms, ${severity})`);
            this._state = STATE.THROTTLING;
            this._lastActionAt = Date.now();
            return; // bir seferde tek kaldıraç (kademeli)
        }
        // Kısılacak kaldıraç kalmadı
        if (this._lastSeverity !== 'maxed') {
            this._addLog('warn', `Tüm kaldıraçlar minimumda ama lag sürüyor (MSPT ${mspt.toFixed(0)}ms).`);
        }
    }

    // ── Recover (kademeli aç) ────────────────────────────────────────────
    _recover(mspt, mode, stableFor, s) {
        const ctx = this._ctx;
        const levers = registry.enabledSorted().reverse(); // en son kısılan ilk açılır

        for (const lever of levers) {
            const cur = registry.currentOf(lever);
            if (cur >= lever.default_value) continue; // zaten default

            // Sweet-spot tavanı: lag yapan değerin bir adım altına kadar aç
            let cap = lever.default_value;
            if (lever.lag_ceiling != null) {
                cap = Math.max(lever.min_value, lever.lag_ceiling - lever.step_up);
                // Uzun süre stabilse tavanı bir adım yukarı zorla (sweet-spot'u yeniden ölç)
                if (stableFor >= s.stableForRecovery * 3 && cap < lever.default_value) {
                    cap = Math.min(lever.default_value, lever.lag_ceiling);
                    if (mode === 'auto') registry.setCeiling(lever.id, null); // tavanı sıfırla, yeniden öğren
                }
            }
            if (cur >= cap) continue; // bu kaldıraç sweet-spot'ta, sıradakine bak

            const newVal = Math.min(cap, lever.default_value, cur + lever.step_up);
            if (newVal === cur) continue;

            const res = appliers.apply(lever, newVal, { dryRun: mode !== 'auto', mc: ctx.getMc(), allowRestart: !!s.allowRestartLevers });
            if (res.skipped) continue;

            if (mode === 'auto') registry.setCurrent(lever.id, newVal >= lever.default_value ? null : newVal);
            registry.logHistory({
                lever_id: lever.id, lever_key: lever.lever_key, action: 'recover', mode,
                old_value: cur, new_value: newVal, mspt_at: mspt, detail: res.detail,
            });
            this._addLog('recover', `${mode === 'auto' ? '⬆' : '⬆[öner]'} ${lever.name}: ${cur} → ${newVal} (MSPT ${mspt.toFixed(0)}ms, stabil ${Math.round(stableFor)}s)`);
            this._state = STATE.RECOVERING;
            this._lastActionAt = Date.now();
            this._stableSince = Date.now(); // tekrar bekle
            return;
        }
        this._state = STATE.NORMAL; // açılacak bir şey kalmadı (sweet-spot'tayız)
    }

    // ── Manuel: tümünü sıfırla ───────────────────────────────────────────
    resetAll(mode) {
        const ctx = this._ctx;
        const levers = registry.list();
        let n = 0;
        for (const lever of levers) {
            const cur = registry.currentOf(lever);
            if (cur === lever.default_value && lever.current_value == null) continue;
            const res = appliers.apply(lever, lever.default_value, { dryRun: mode !== 'auto', mc: ctx?.getMc?.(), allowRestart: true });
            if (mode === 'auto') { registry.setCurrent(lever.id, null); registry.setCeiling(lever.id, null); }
            registry.logHistory({ lever_id: lever.id, lever_key: lever.lever_key, action: 'reset', mode, old_value: cur, new_value: lever.default_value, detail: res.detail });
            n++;
        }
        this._addLog('reset', `${n} kaldıraç default'a sıfırlandı.`);
        this._state = STATE.NORMAL;
        return n;
    }

    getState() {
        return {
            state: this._state,
            severity: this._lastSeverity,
            avgMspt: this._avgMspt(4),
            lastActionAt: this._lastActionAt || null,
            stableSince: this._stableSince || null,
            log: this._log.slice(-50),
        };
    }
}

module.exports = new Decision();
