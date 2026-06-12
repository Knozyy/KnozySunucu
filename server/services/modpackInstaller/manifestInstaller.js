const fs = require('fs');
const path = require('path');

/**
 * CurseForge "client pack" kurulumu: manifest.json'daki modları CF API'den
 * indirir, overrides/ içeriğini köke kopyalar.
 *
 * Client zip'te modların KENDİSİ yoktur — sadece manifest (projectID/fileID
 * listesi) ve overrides (config'ler) bulunur. Server pack'i olmayan paketlerde
 * çalışan bir sunucu üretmenin tek yolu bu manifest'i işlemektir.
 */

const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_RETRIES = 2;
const BATCH_SIZE = 50; // CF /v1/mods/files istek başına limit

function isManifestPack(installPath) {
    const m = readManifest(installPath);
    return !!(m && m.minecraft && Array.isArray(m.files));
}

function readManifest(installPath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(installPath, 'manifest.json'), 'utf8'));
    } catch { return null; }
}

/** "forge-47.2.0" | "neoforge-21.1.77" | "fabric-0.16.9" → { type, version } */
function parseLoaderId(id) {
    const lower = String(id || '').toLowerCase();
    for (const type of ['neoforge', 'fabric', 'quilt', 'forge']) {
        if (lower.startsWith(type + '-')) {
            return { type, version: lower.slice(type.length + 1) };
        }
    }
    return { type: 'unknown', version: null };
}

/**
 * @returns {{ mcVersion, loader: {type, version}, files: Array<{projectID, fileID, required}>, overridesDir, name } | null}
 */
function parseManifest(installPath) {
    const m = readManifest(installPath);
    if (!m || !m.minecraft) return null;
    const primary = (m.minecraft.modLoaders || []).find((l) => l.primary) || (m.minecraft.modLoaders || [])[0];
    return {
        name: m.name || null,
        mcVersion: m.minecraft.version || null,
        loader: primary ? parseLoaderId(primary.id) : { type: 'unknown', version: null },
        files: (m.files || []).map((f) => ({
            projectID: f.projectID,
            fileID: f.fileID,
            required: f.required !== false,
        })),
        overridesDir: m.overrides || 'overrides',
    };
}

/** mods/ klasöründe manifest'teki mod sayısının kabaca karşılığı var mı? */
function modsLookInstalled(installPath, manifest) {
    try {
        const jars = fs.readdirSync(path.join(installPath, 'mods')).filter((f) => f.endsWith('.jar'));
        const required = manifest.files.filter((f) => f.required).length;
        // Server pack'lerde bazı client modları çıkarılır; %50 eşik yeterli ayrım sağlar
        return required > 0 && jars.length >= required * 0.5;
    } catch { return false; }
}

/** overrides/ içeriğini köke kopyala (config, kubejs, defaultconfigs, ek modlar...) */
function applyOverrides(installPath, overridesDir, log) {
    const src = path.join(installPath, overridesDir);
    if (!fs.existsSync(src)) return 0;
    let count = 0;
    for (const item of fs.readdirSync(src)) {
        const from = path.join(src, item);
        const to = path.join(installPath, item);
        try {
            fs.cpSync(from, to, { recursive: true, force: true });
            count++;
        } catch (err) {
            if (log) log(`overrides kopyalama hatası (${item}): ${err.message}`);
        }
    }
    try { fs.rmSync(src, { recursive: true, force: true }); } catch { /* ignore */ }
    if (log) log(`overrides/ uygulandı (${count} öğe)`);
    return count;
}

/**
 * CF API'den dosya detaylarını toplu çek.
 * @param {Array<{projectID, fileID}>} files
 * @param {object} cf  curseforgeService (apiRequest/apiRequestPost)
 * @returns {Map<number, object>} fileID → file detayı
 */
async function fetchFileDetails(files, cf) {
    const byId = new Map();
    const ids = files.map((f) => f.fileID);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        try {
            const res = await cf.apiRequestPost('/v1/mods/files', { fileIds: chunk });
            for (const fd of res.data || []) byId.set(fd.id, fd);
        } catch { /* batch düşerse tekli fallback aşağıda */ }
    }

    // Batch'te gelmeyenler için tekli GET (nadiren gerekir)
    for (const f of files) {
        if (byId.has(f.fileID)) continue;
        try {
            const res = await cf.apiRequest(`/v1/mods/${f.projectID}/files/${f.fileID}`);
            if (res.data) byId.set(f.fileID, res.data);
        } catch { /* eksik olarak raporlanır */ }
    }
    return byId;
}

/**
 * Manifest'teki tüm modları indir.
 * @param {string} installPath
 * @param {object} deps { cf: curseforgeService, onProgress?: (pct, status)=>void, log?: (msg)=>void }
 * @returns {{ downloaded: number, failed: Array<{projectID, fileID, fileName, reason}> }}
 */
async function downloadMods(installPath, manifest, { cf, onProgress, log }) {
    const emit = log || (() => {});
    const modsDir = path.join(installPath, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

    const required = manifest.files.filter((f) => f.required);
    emit(`${required.length} mod indirilecek (manifest)`);

    const details = await fetchFileDetails(required, cf);

    const failed = [];
    let done = 0;

    const queue = [...required];
    const worker = async () => {
        while (queue.length > 0) {
            const f = queue.shift();
            const fd = details.get(f.fileID);

            if (!fd) {
                failed.push({ projectID: f.projectID, fileID: f.fileID, fileName: null, reason: 'API detayı alınamadı' });
            } else if (!fd.downloadUrl) {
                // Mod sahibi 3. parti dağıtımı kapatmış — elle indirilmeli
                failed.push({ projectID: f.projectID, fileID: f.fileID, fileName: fd.fileName, reason: 'Dağıtım kapalı (elle indirin)' });
            } else {
                const dest = path.join(modsDir, fd.fileName);
                let ok = false;
                for (let attempt = 0; attempt <= DOWNLOAD_RETRIES && !ok; attempt++) {
                    try {
                        await cf.downloadFile(fd.downloadUrl, dest);
                        ok = true;
                    } catch (err) {
                        if (attempt === DOWNLOAD_RETRIES) {
                            failed.push({ projectID: f.projectID, fileID: f.fileID, fileName: fd.fileName, reason: `İndirme hatası: ${err.message}` });
                        }
                    }
                }
            }

            done++;
            if (onProgress) onProgress(Math.floor((done / required.length) * 100), `Modlar: ${done}/${required.length}`);
        }
    };

    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, required.length) }, worker));

    if (failed.length > 0) {
        writeMissingReport(installPath, failed);
        emit(`${failed.length} mod indirilemedi — eksik-modlar.txt dosyasına bakın`);
    }
    return { downloaded: done - failed.length, failed };
}

function writeMissingReport(installPath, failed) {
    const lines = [
        '# İndirilemeyen Modlar — Knozy Sunucu Paneli',
        '# Bu modları aşağıdaki sayfalardan elle indirip mods/ klasörüne atın.',
        '',
        ...failed.map((f) =>
            `- ${f.fileName || `proje ${f.projectID} / dosya ${f.fileID}`}  (${f.reason})\n` +
            `  https://www.curseforge.com/projects/${f.projectID}`
        ),
        '',
    ];
    try { fs.writeFileSync(path.join(installPath, 'eksik-modlar.txt'), lines.join('\n'), 'utf8'); } catch { /* ignore */ }
}

/**
 * Tam manifest kurulumu: modlar + overrides. Loader kurulumu finalizer'da.
 * @returns {{ manifest, downloaded, failed }}
 */
async function installFromManifest(installPath, { cf, onProgress, log }) {
    const manifest = parseManifest(installPath);
    if (!manifest) throw new Error('manifest.json okunamadı');

    const result = await downloadMods(installPath, manifest, { cf, onProgress, log });
    applyOverrides(installPath, manifest.overridesDir, log);

    return { manifest, ...result };
}

module.exports = {
    isManifestPack,
    parseManifest,
    parseLoaderId,
    modsLookInstalled,
    applyOverrides,
    downloadMods,
    installFromManifest,
    fetchFileDetails,
};
