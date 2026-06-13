/**
 * LagGuard · Attribution · FTB Chunks/Teams (Faz 3)
 * ─────────────────────────────────────────────────
 * "Lag yapan koordinatın sahibi kim?" → FTB Chunks claim verisinden çözer.
 *
 * Disk formatı (FTB maintainer'a göre):
 *   world/ftbchunks/<takım-uuid>.snbt  →  { chunks: [ {x, z, dimension, ...} ] }
 *     party ise member_data (üye UUID'leri) içerir.
 *   world/ftbteams/**​/<takım-uuid>.snbt →  display_name + members (UUID→rank)
 *
 * SNBT okunabilir metin; tam alan adları sürüm-özgü olabildiğinden parser
 * SAVUNMACIDIR: x/z + en yakın-önceki dimension string'iyle eşler (hem per-entry
 * hem grouped-by-dim düzenini yakalar). Bulunamazsa null + rapor döner.
 */
const fs = require('fs');
const path = require('path');
const usercache = require('./usercache');

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const DIM_TOK = /"((?:minecraft|[a-z0-9_]+):[a-z0-9_/.-]+)"/g;            // "ns:id"

function firstExisting(base, rels) {
    for (const rel of rels) {
        try { const p = path.join(base, rel); if (fs.existsSync(p)) return p; } catch { /* ignore */ }
    }
    return null;
}

function listSnbt(dir) {
    try { return fs.readdirSync(dir).filter(f => /\.snbt$/i.test(f)); } catch { return []; }
}

let _cache = { at: 0, key: '', claims: null, teams: null, note: '', available: false };
const TTL = 30_000;

const ftbChunks = {
    _dirs(serverPath) {
        return {
            chunksDir: firstExisting(serverPath, ['world/ftbchunks', 'world/data/ftbchunks', 'data/ftbchunks']),
            teamsDir:  firstExisting(serverPath, ['world/ftbteams', 'world/data/ftbteams', 'data/ftbteams']),
        };
    },

    /** Takım UUID → { name, members[] } (display_name + üye UUID'leri). */
    _loadTeams(teamsDir) {
        const teams = {};
        if (!teamsDir) return teams;
        // ftbteams alt klasörlü olabilir (players/parties) — bir seviye derinlik tara
        const roots = [teamsDir];
        try {
            for (const e of fs.readdirSync(teamsDir, { withFileTypes: true })) {
                if (e.isDirectory()) roots.push(path.join(teamsDir, e.name));
            }
        } catch { /* ignore */ }
        for (const root of roots) {
            for (const f of listSnbt(root)) {
                const teamId = f.replace(/\.snbt$/i, '');
                let text = '';
                try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
                const nameM = text.match(/\b(?:display_?name|name)\s*:\s*"([^"]{1,32})"/i);
                const members = [];
                const mm = text.match(/members?\s*:\s*\{([\s\S]*?)\}/i);
                const scope = mm ? mm[1] : text;
                let u; const re = new RegExp(UUID_RE.source, 'g');
                while ((u = re.exec(scope))) members.push(u[0]);
                // SNBT'de aynı UUID birden çok kez geçebilir (owner/member/rank) → benzersizleştir
                teams[teamId.toLowerCase()] = { name: nameM ? nameM[1] : null, members: [...new Set(members)] };
            }
        }
        return teams;
    },

    /** "dim|cx,cz" → takımUUID  claim haritası. Blok-kapsamlı (entry sızması yok). */
    _loadClaims(chunksDir) {
        const claims = {};
        let parsed = 0;
        if (!chunksDir) return { claims, parsed };
        for (const f of listSnbt(chunksDir)) {
            const teamId = f.replace(/\.snbt$/i, '').toLowerCase();
            let text = '';
            try { text = fs.readFileSync(path.join(chunksDir, f), 'utf8'); } catch { continue; }

            // Dimension token konumları (grouped-by-dim düzeni için nearest-preceding)
            const dims = [];
            let dm; const dre = new RegExp(DIM_TOK.source, 'g');
            while ((dm = dre.exec(text))) dims.push({ idx: dm.index, dim: dm[1] });
            const dimAt = (idx) => {
                let best = 'minecraft:overworld';
                for (const d of dims) { if (d.idx <= idx) best = d.dim; else break; }
                return best;
            };

            // Her flat { … } bloğu = bir chunk entry (iç içe değil → entry sızması olmaz)
            const bre = /\{([^{}]*)\}/g;
            let bm;
            while ((bm = bre.exec(text))) {
                const body = bm[1];
                const xm = body.match(/\bx\s*:\s*(-?\d+)/);
                const zm = body.match(/\bz\s*:\s*(-?\d+)/);
                if (!xm || !zm) continue;
                const inDim = body.match(/"((?:minecraft|[a-z0-9_]+):[a-z0-9_/.-]+)"/);
                const dim = inDim ? inDim[1] : dimAt(bm.index);
                const key = `${dim}|${parseInt(xm[1])},${parseInt(zm[1])}`;
                if (!(key in claims)) { claims[key] = teamId; parsed++; }
            }
        }
        return { claims, parsed };
    },

    _load(serverPath) {
        const { chunksDir, teamsDir } = this._dirs(serverPath);
        const key = `${chunksDir}|${teamsDir}`;
        const now = Date.now();
        if (now - _cache.at < TTL && _cache.key === key) return _cache;
        if (!chunksDir && !teamsDir) {
            _cache = { at: now, key, claims: {}, teams: {}, parsed: 0, available: false,
                note: 'FTB Chunks/Teams verisi yok (paket FTB Chunks kullanmıyor olabilir).' };
            return _cache;
        }
        const teams = this._loadTeams(teamsDir);
        const { claims, parsed } = this._loadClaims(chunksDir);
        _cache = {
            at: now, key, claims, teams, parsed, available: !!chunksDir,
            note: chunksDir
                ? (parsed ? `${parsed} claim okundu.` : 'FTB Chunks verisi var ama claim parse edilemedi (format farklı olabilir).')
                : 'Sadece FTB Teams verisi var; chunk claim verisi yok.',
        };
        return _cache;
    },

    /** Atıf için durum + sahip listesi (panelde rapor). */
    status(serverPath) {
        if (!serverPath) return { available: false, owners: [], note: 'serverPath yok' };
        const d = this._load(serverPath);
        const owners = Object.entries(d.teams).map(([id, t]) => ({ team: id, name: t.name, members: t.members?.length || 0 })).slice(0, 30);
        return { available: d.available, parsed: d.parsed, owners, note: d.note };
    },

    /**
     * Blok koordinatının (dim,x,z) FTB claim sahibi.
     * @returns {{ team, owner, owners[] } | null}
     */
    ownerAt(serverPath, dim, blockX, blockZ) {
        if (!serverPath || !dim) return null;
        const d = this._load(serverPath);
        if (!d.parsed) return null;
        const cx = Math.floor(blockX / 16), cz = Math.floor(blockZ / 16);
        const teamId = d.claims[`${dim}|${cx},${cz}`];
        if (!teamId) return null;
        const team = d.teams[teamId];
        // Sahip ismi: takım display_name → yoksa ilk üyenin oyuncu adı (usercache)
        let owner = team?.name || null;
        const memberNames = (team?.members || []).map(u => usercache.nameOf(serverPath, u)).filter(Boolean);
        if (!owner && memberNames.length) owner = memberNames[0];
        if (!owner) owner = usercache.nameOf(serverPath, teamId) || null; // solo: takımId = oyuncu UUID olabilir
        return { team: teamId, owner, owners: memberNames };
    },
};

module.exports = ftbChunks;
