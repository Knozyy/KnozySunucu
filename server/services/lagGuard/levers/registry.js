/**
 * LagGuard · Lever Registry
 * ─────────────────────────
 * Kaldıraçlar tamamen veri-tabanlı; kodda moda özel sabit yok.
 *
 * MODEL (yön-bağımsız):
 *   default_value → normal/istenen değer (lag yokken).
 *   relief_value  → lag'de gidilecek değer (rahatlama). default'tan KÜÇÜK de
 *                   BÜYÜK de olabilir; yön buradan otomatik anlaşılır.
 *   step          → her aksiyonda değişim miktarı.
 *   Örn. randomTickSpeed: default 3, relief 0  (lag'de AZALT).
 *        pipez speed (tick gecikmesi): default 20, relief 40 (lag'de ARTIR = yavaşlat).
 */
const { getDb } = require('../../../db/database');

const STARTER = [
    {
        lever_key: 'random_tick_speed', name: 'Random Tick Speed',
        description: 'Bitki/farm/buz/ateş yayılım hızı. Lag\'de AZALT. (vanilla varsayılan 3)',
        apply_method: 'gamerule', apply_template: 'gamerule randomTickSpeed {value}',
        value_type: 'int', default_value: 3, relief_value: 0, step: 1, priority: 10, enabled: 1, is_builtin: 1,
    },
    {
        lever_key: 'max_entity_cramming', name: 'Entity Cramming',
        description: 'Aynı bloktaki maksimum entity. Lag\'de AZALT (yoğun yığınları seyreltir).',
        apply_method: 'gamerule', apply_template: 'gamerule maxEntityCramming {value}',
        value_type: 'int', default_value: 24, relief_value: 4, step: 4, priority: 20, enabled: 1, is_builtin: 1,
    },
    {
        lever_key: 'mob_spawning', name: 'Mob Spawning (acil)',
        description: 'Son çare: doğal mob spawn\'ını kapatır (lag\'de 1→0). Varsayılan devre dışı.',
        apply_method: 'gamerule', apply_template: 'gamerule doMobSpawning {value}',
        value_type: 'int', default_value: 1, relief_value: 0, step: 1, priority: 90, enabled: 0, is_builtin: 1,
    },
];

const INS_COLS = [
    'lever_key', 'name', 'description', 'apply_method', 'apply_template',
    'config_path', 'config_format', 'config_key', 'reload_command',
    'value_type', 'default_value', 'relief_value', 'step', 'min_value', 'max_value', 'priority', 'enabled',
];

function db() { return getDb(); }

function normalize(data, isUpdate = false) {
    const row = {};
    for (const c of INS_COLS) row[c] = data[c] ?? null;
    row.apply_method = data.apply_method || 'gamerule';
    row.value_type = data.value_type || 'int';
    row.config_format = data.config_format || 'toml';
    row.priority = data.priority ?? 50;
    row.step = data.step ?? 1;
    row.enabled = data.enabled === false ? 0 : (data.enabled === 0 ? 0 : 1);
    if (row.default_value == null) throw new Error('default_value gerekli');
    if (row.relief_value == null) throw new Error('relief_value (lag\'de gidilecek değer) gerekli');
    // Legacy min_value/max_value sütunları eski DB'lerde NOT NULL olabilir →
    // default/relief'ten türetip doldur (yoksa "NOT NULL constraint" hatası).
    const dv = Number(row.default_value), rv = Number(row.relief_value);
    if (row.min_value == null) row.min_value = Math.min(dv, rv);
    if (row.max_value == null) row.max_value = Math.max(dv, rv);
    return row;
}

const registry = {
    seedStarter() {
        try {
            const d = db();
            const existing = d.prepare('SELECT lever_key FROM lag_levers').all().map(r => r.lever_key);
            const ins = d.prepare(`INSERT INTO lag_levers
                (lever_key,name,description,apply_method,apply_template,value_type,default_value,relief_value,step,min_value,max_value,priority,enabled,is_builtin)
                VALUES (@lever_key,@name,@description,@apply_method,@apply_template,@value_type,@default_value,@relief_value,@step,@min_value,@max_value,@priority,@enabled,@is_builtin)`);
            for (const l of STARTER) {
                if (existing.includes(l.lever_key)) continue;
                // legacy min/max sütunlarını doldur (eski DB'lerde NOT NULL)
                ins.run({ ...l, min_value: Math.min(l.default_value, l.relief_value), max_value: Math.max(l.default_value, l.relief_value) });
            }
        } catch { /* tablo henüz olmayabilir */ }
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
        const row = normalize(data);
        const res = db().prepare(`INSERT INTO lag_levers
            (lever_key,name,description,apply_method,apply_template,config_path,config_format,config_key,reload_command,
             value_type,default_value,relief_value,step,min_value,max_value,priority,enabled)
            VALUES (@lever_key,@name,@description,@apply_method,@apply_template,@config_path,@config_format,@config_key,@reload_command,
             @value_type,@default_value,@relief_value,@step,@min_value,@max_value,@priority,@enabled)`).run(row);
        return this.get(res.lastInsertRowid);
    },

    /** Birden fazla kaldıracı tek seferde ekle (toplu ekleme). */
    bulkCreate(items) {
        const d = db();
        const existing = new Set(d.prepare('SELECT lever_key FROM lag_levers').all().map(r => r.lever_key));
        const stmt = d.prepare(`INSERT INTO lag_levers
            (lever_key,name,description,apply_method,apply_template,config_path,config_format,config_key,reload_command,
             value_type,default_value,relief_value,step,min_value,max_value,priority,enabled)
            VALUES (@lever_key,@name,@description,@apply_method,@apply_template,@config_path,@config_format,@config_key,@reload_command,
             @value_type,@default_value,@relief_value,@step,@min_value,@max_value,@priority,@enabled)`);
        let n = 0;
        const tx = d.transaction((rows) => {
            for (const r of rows) {
                if (existing.has(r.lever_key)) continue;
                stmt.run(r); existing.add(r.lever_key); n++;
            }
        });
        tx(items.map(i => normalize(i)));
        return n;
    },

    update(id, data) {
        const cur = this.get(id);
        if (!cur) throw new Error('Kaldıraç bulunamadı');
        const merged = { ...cur };
        for (const c of INS_COLS) if (c in data) merged[c] = data[c];
        if ('enabled' in data) merged.enabled = data.enabled ? 1 : 0;
        db().prepare(`UPDATE lag_levers SET
            name=@name, description=@description, apply_method=@apply_method, apply_template=@apply_template,
            config_path=@config_path, config_format=@config_format, config_key=@config_key, reload_command=@reload_command,
            value_type=@value_type, default_value=@default_value, relief_value=@relief_value, step=@step,
            min_value=@min_value, max_value=@max_value, priority=@priority, enabled=@enabled WHERE id=@id`)
            .run({ ...merged, id });
        return this.get(id);
    },

    remove(id) { db().prepare('DELETE FROM lag_levers WHERE id = ?').run(id); },

    toggle(id) {
        const l = this.get(id);
        if (!l) throw new Error('Kaldıraç bulunamadı');
        const ne = l.enabled ? 0 : 1;
        db().prepare('UPDATE lag_levers SET enabled = ? WHERE id = ?').run(ne, id);
        return { enabled: !!ne };
    },

    setCurrent(id, value) { db().prepare('UPDATE lag_levers SET current_value = ? WHERE id = ?').run(value, id); },
    setCeiling(id, value) { db().prepare('UPDATE lag_levers SET lag_ceiling = ? WHERE id = ?').run(value, id); },
    resetAll() { db().prepare('UPDATE lag_levers SET current_value = NULL, lag_ceiling = NULL').run(); },

    /**
     * Faz 2 · Etki kaydı: bir kaldıraç kısıldıktan sonra MSPT'de ölçülen düşüşü
     * (delta = msptÖnce - msptSonra) üstel hareketli ortalamayla biriktirir.
     * Pozitif effect_score = kısmak gerçekten MSPT'yi düşürüyor (etkili kaldıraç).
     */
    recordEffect(id, delta) {
        try {
            const l = this.get(id);
            if (!l) return;
            const alpha = 0.3;
            const prev = l.effect_score;
            const next = prev == null ? delta : prev * (1 - alpha) + delta * alpha;
            db().prepare('UPDATE lag_levers SET effect_score = ?, effect_samples = effect_samples + 1 WHERE id = ?')
                .run(Math.round(next * 1000) / 1000, id);
        } catch { /* ignore */ }
    },

    logHistory(entry) {
        try {
            db().prepare(`INSERT INTO lag_lever_history
                (lever_id,lever_key,action,mode,old_value,new_value,mspt_at,detail)
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

    currentOf(lever) { return lever.current_value != null ? lever.current_value : lever.default_value; },
};

module.exports = registry;
