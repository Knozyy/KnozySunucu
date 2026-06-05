/**
 * LagGuard · Lever Registry
 * ─────────────────────────
 * Kaldıraçlar (levers) tamamen veri-tabanlı: hangi mod/ayarın nasıl kısılacağı
 * DB'de tanımlı, kodda moda özel sabit yok. Bu sayede her modpack/sürümde çalışır.
 *
 * Bir kaldıraç = bir sayısal ayar + nasıl uygulanacağı (apply_method/template).
 * AIMD döngüsü değeri default↔min arasında kademeli oynatır.
 */
const { getDb } = require('../../../db/database');

// ── Başlangıç kütüphanesi (evrensel, her sürümde çalışan canlı kaldıraçlar) ──
const STARTER = [
    {
        lever_key: 'random_tick_speed',
        name: 'Random Tick Speed',
        description: 'Bitki/farm/buz/ateş yayılımı tick hızı. Düşürmek MSPT\'yi ciddi azaltır. (vanilla varsayılan 3)',
        apply_method: 'gamerule',
        apply_template: 'gamerule randomTickSpeed {value}',
        value_type: 'int',
        default_value: 3, min_value: 0, max_value: 3,
        step_down: 1, step_up: 1,
        priority: 10, enabled: 1, is_builtin: 1,
    },
    {
        lever_key: 'max_entity_cramming',
        name: 'Entity Cramming',
        description: 'Aynı bloktaki maksimum entity sayısı. Düşürmek yoğun mob/farm yığınlarını seyreltir.',
        apply_method: 'gamerule',
        apply_template: 'gamerule maxEntityCramming {value}',
        value_type: 'int',
        default_value: 24, min_value: 4, max_value: 24,
        step_down: 4, step_up: 2,
        priority: 20, enabled: 1, is_builtin: 1,
    },
    {
        lever_key: 'mob_spawning',
        name: 'Mob Spawning (acil)',
        description: 'Son çare: doğal mob spawn\'ını kapatır (0=kapalı, 1=açık). Varsayılan devre dışı.',
        apply_method: 'gamerule',
        apply_template: 'gamerule doMobSpawning {value}',
        value_type: 'int',
        default_value: 1, min_value: 0, max_value: 1,
        step_down: 1, step_up: 1,
        priority: 90, enabled: 0, is_builtin: 1,
    },
];

const COLS = [
    'lever_key', 'name', 'description', 'apply_method', 'apply_template',
    'config_path', 'config_format', 'config_key', 'reload_command',
    'value_type', 'default_value', 'min_value', 'max_value',
    'step_down', 'step_up', 'priority', 'enabled',
];

function db() { return getDb(); }

const registry = {
    seedStarter() {
        try {
            const d = db();
            const existing = d.prepare('SELECT lever_key FROM lag_levers').all().map(r => r.lever_key);
            const ins = d.prepare(`INSERT INTO lag_levers
                (lever_key, name, description, apply_method, apply_template, value_type,
                 default_value, min_value, max_value, step_down, step_up, priority, enabled, is_builtin)
                VALUES (@lever_key, @name, @description, @apply_method, @apply_template, @value_type,
                 @default_value, @min_value, @max_value, @step_down, @step_up, @priority, @enabled, @is_builtin)`);
            for (const l of STARTER) {
                if (!existing.includes(l.lever_key)) ins.run(l);
            }
        } catch (e) { /* tablo henüz olmayabilir */ }
    },

    list() {
        try { return db().prepare('SELECT * FROM lag_levers ORDER BY priority ASC, id ASC').all(); }
        catch { return []; }
    },

    get(id) {
        try { return db().prepare('SELECT * FROM lag_levers WHERE id = ?').get(id); }
        catch { return null; }
    },

    enabledSorted() {
        try { return db().prepare('SELECT * FROM lag_levers WHERE enabled = 1 ORDER BY priority ASC, id ASC').all(); }
        catch { return []; }
    },

    create(data) {
        const d = db();
        const row = {};
        for (const c of COLS) row[c] = data[c] ?? null;
        row.enabled = data.enabled === false ? 0 : 1;
        row.value_type = data.value_type || 'int';
        row.apply_method = data.apply_method || 'gamerule';
        row.config_format = data.config_format || 'toml';
        row.priority = data.priority ?? 50;
        row.step_down = data.step_down ?? 1;
        row.step_up = data.step_up ?? 1;
        const res = d.prepare(`INSERT INTO lag_levers
            (lever_key, name, description, apply_method, apply_template, config_path, config_format,
             config_key, reload_command, value_type, default_value, min_value, max_value,
             step_down, step_up, priority, enabled)
            VALUES (@lever_key,@name,@description,@apply_method,@apply_template,@config_path,@config_format,
             @config_key,@reload_command,@value_type,@default_value,@min_value,@max_value,
             @step_down,@step_up,@priority,@enabled)`).run(row);
        return this.get(res.lastInsertRowid);
    },

    update(id, data) {
        const cur = this.get(id);
        if (!cur) throw new Error('Kaldıraç bulunamadı');
        const merged = { ...cur };
        for (const c of COLS) if (c in data) merged[c] = data[c];
        if ('enabled' in data) merged.enabled = data.enabled ? 1 : 0;
        db().prepare(`UPDATE lag_levers SET
            name=@name, description=@description, apply_method=@apply_method, apply_template=@apply_template,
            config_path=@config_path, config_format=@config_format, config_key=@config_key,
            reload_command=@reload_command, value_type=@value_type, default_value=@default_value,
            min_value=@min_value, max_value=@max_value, step_down=@step_down, step_up=@step_up,
            priority=@priority, enabled=@enabled WHERE id=@id`).run({ ...merged, id });
        return this.get(id);
    },

    remove(id) {
        db().prepare('DELETE FROM lag_levers WHERE id = ?').run(id);
    },

    toggle(id) {
        const l = this.get(id);
        if (!l) throw new Error('Kaldıraç bulunamadı');
        const ne = l.enabled ? 0 : 1;
        db().prepare('UPDATE lag_levers SET enabled = ? WHERE id = ?').run(ne, id);
        return { enabled: !!ne };
    },

    setCurrent(id, value) {
        db().prepare('UPDATE lag_levers SET current_value = ? WHERE id = ?').run(value, id);
    },

    setCeiling(id, value) {
        db().prepare('UPDATE lag_levers SET lag_ceiling = ? WHERE id = ?').run(value, id);
    },

    /** Tüm kaldıraçları default'a döndür (current_value=NULL, ceiling temizle). */
    resetAll() {
        db().prepare('UPDATE lag_levers SET current_value = NULL, lag_ceiling = NULL').run();
    },

    // ── Geçmiş ──
    logHistory(entry) {
        try {
            db().prepare(`INSERT INTO lag_lever_history
                (lever_id, lever_key, action, mode, old_value, new_value, mspt_at, detail)
                VALUES (@lever_id,@lever_key,@action,@mode,@old_value,@new_value,@mspt_at,@detail)`)
                .run({
                    lever_id: entry.lever_id ?? null, lever_key: entry.lever_key ?? null,
                    action: entry.action, mode: entry.mode ?? null,
                    old_value: entry.old_value ?? null, new_value: entry.new_value ?? null,
                    mspt_at: entry.mspt_at ?? null, detail: entry.detail ?? null,
                });
        } catch { /* ignore */ }
    },

    history(limit = 100) {
        try { return db().prepare('SELECT * FROM lag_lever_history ORDER BY id DESC LIMIT ?').all(limit); }
        catch { return []; }
    },

    // Yardımcı: kaldıracın etkin (current ?? default) değeri
    currentOf(lever) {
        return lever.current_value != null ? lever.current_value : lever.default_value;
    },
};

module.exports = registry;
