/**
 * LagGuard · Attribution · FTB Chunks/Teams (Faz 3)
 * ─────────────────────────────────────────────────
 * "Claim sahibi UUID birincil" hedefi için FTB Chunks claim verisini en iyi
 * çabayla okur. FTB verisi sürüm/paket arası farklı yerlerde ve formatlarda
 * (SNBT/JSON) durabilir; bu modül SAVUNMACIDIR: bulamazsa { available:false }
 * döner ve atıf yine de boyut + online oyuncu korelasyonuyla çalışır.
 *
 * NOT: chunk→claim eşlemesinin ikili/SNBT formatı paket-özgü olabilir; bu yüzden
 * v1'de FTB Teams sahip (owner) UUID↔isim eşlemesini çıkarır ve claim verisinin
 * MEVCUT olup olmadığını raporlar. Chunk-düzeyi tam eşleme canlı format
 * doğrulandıktan sonra genişletilebilir (probe bunu opsiyonel zenginleştirme
 * olarak kullanır).
 */
const fs = require('fs');
const path = require('path');

// FTB verisinin denenecek olası kökleri (serverPath'e göreli).
const CANDIDATE_DIRS = [
    'world/data/ftbchunks',
    'world/data/ftbteams',
    'world/ftbchunks',
    'world/ftbteams',
    'data/ftbchunks',
    'data/ftbteams',
];

function firstExisting(serverPath, rels) {
    for (const rel of rels) {
        try {
            const p = path.join(serverPath, rel);
            if (fs.existsSync(p)) return p;
        } catch { /* ignore */ }
    }
    return null;
}

// UUID (dashed) yakalayıcı
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

const ftbChunks = {
    /**
     * Atıf için FTB verisinin durumunu raporlar (savunmacı).
     * @returns {{ available, chunksDir, teamsDir, owners, note }}
     */
    status(serverPath) {
        if (!serverPath) return { available: false, owners: [], note: 'serverPath yok' };
        const chunksDir = firstExisting(serverPath, ['world/data/ftbchunks', 'world/ftbchunks', 'data/ftbchunks']);
        const teamsDir  = firstExisting(serverPath, ['world/data/ftbteams', 'world/ftbteams', 'data/ftbteams']);
        if (!chunksDir && !teamsDir) {
            return { available: false, owners: [], note: 'FTB Chunks/Teams verisi bulunamadı (paket FTB Chunks kullanmıyor olabilir).' };
        }
        const owners = teamsDir ? this._readTeamOwners(teamsDir) : [];
        return {
            available: true,
            chunksDir: chunksDir || null,
            teamsDir: teamsDir || null,
            owners,
            note: chunksDir
                ? 'FTB Chunks verisi mevcut. (chunk→claim tam eşlemesi canlı format doğrulandıktan sonra genişletilecek.)'
                : 'Sadece FTB Teams verisi bulundu; chunk claim verisi yok.',
        };
    },

    /**
     * FTB Teams dosyalarından sahip (owner) UUID↔isim adaylarını çıkarır.
     * SNBT/JSON karışık olabilir; metin üstünden UUID + yakın isim yakalar (best-effort).
     */
    _readTeamOwners(teamsDir) {
        const owners = [];
        try {
            const files = fs.readdirSync(teamsDir).filter(f => /\.(snbt|json|nbt|txt)$/i.test(f));
            for (const f of files.slice(0, 200)) {
                let text = '';
                try { text = fs.readFileSync(path.join(teamsDir, f), 'utf8'); } catch { continue; }
                const uuids = text.match(UUID_RE);
                if (!uuids) continue;
                // İsim ipucu: "name": "X" veya display/owner alanları
                const nameMatch = text.match(/"?(?:name|display_?name|owner)"?\s*[:=]\s*"([^"]{1,16})"/i);
                owners.push({
                    team: f.replace(/\.(snbt|json|nbt|txt)$/i, ''),
                    ownerUuid: uuids[0],
                    ownerName: nameMatch ? nameMatch[1] : null,
                });
            }
        } catch { /* ignore */ }
        return owners;
    },
};

module.exports = ftbChunks;
