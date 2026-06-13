const fs = require('fs');
const path = require('path');
const { getDb } = require('../../db/database');

/**
 * Elle modpack oluşturma + akıllı dosya yerleştirme.
 *
 * Akış: kullanıcı isim girer → boş profil oluşur (sunucular/<slug>) → dosyaları
 * tek tek yükler → her dosya türüne göre doğru yere konur → "çalıştırılabilir
 * yap" ile finalizer paketi tespit edip başlatılabilir hale getirir.
 *
 * Akıllı yerleştirme:
 *   .zip            → profile açılır + iç içe klasör düzleştirilir (pack/server pack)
 *   .jar (loader)   → köke (forge/neoforge/fabric/quilt/server/installer adlılar)
 *   .jar (mod)      → mods/
 *   diğer (toml...) → köke
 */

const baseServerPath = () => path.join(__dirname, '../../../sunucular');

function slugify(name) {
    return String(name || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'modpack';
}

/** Çakışmayan benzersiz slug üret (zaten varsa -2, -3 ...). */
function uniqueSlug(base) {
    const root = baseServerPath();
    let slug = base;
    let n = 2;
    while (fs.existsSync(path.join(root, slug))) {
        slug = `${base}-${n++}`;
    }
    return slug;
}

/**
 * İsimle boş modpack profili oluştur.
 * @returns {{ id, name, slug, installPath, server_port }}
 */
function createEmptyPack(name) {
    if (!name || !name.trim()) throw new Error('Modpack adı gerekli');
    const db = getDb();
    const cleanName = name.trim();
    const slug = uniqueSlug(slugify(cleanName));
    const installPath = path.join(baseServerPath(), slug);

    fs.mkdirSync(installPath, { recursive: true });
    fs.mkdirSync(path.join(installPath, 'mods'), { recursive: true });

    const curseforgeService = require('../curseforgeService');
    const serverPort = curseforgeService._pickFreePort(db);

    const existingActive = db.prepare('SELECT id FROM installed_modpacks WHERE is_active = 1').get();
    const isFirstInstall = !existingActive;

    const res = db.prepare(`
        INSERT INTO installed_modpacks
            (curseforge_id, name, version, author, logo_url, install_path, is_active, status, provider, server_port)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'empty', 'manual', ?)
    `).run(
        null, cleanName, 'elle', 'Manuel', null,
        installPath, isFirstInstall ? 1 : 0, serverPort
    );

    curseforgeService._writeServerPort(installPath, serverPort);

    return { id: res.lastInsertRowid, name: cleanName, slug, installPath, server_port: serverPort };
}

/**
 * Dosya adından mod mu yoksa kök (loader/sunucu) dosyası mı olduğunu sezer.
 * Önemli: loader adı dosya BAŞINDA olmalı — "sodium-fabric-x.jar" gibi adında
 * loader geçen modlar yanlışlıkla köke konmasın.
 */
function classifyJar(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.includes('installer')) return 'root';
    if (lower === 'server.jar' || lower.includes('minecraft_server') || /^fabric-server-launch(er)?\.jar$/.test(lower)) return 'root';
    // forge-1.20.1-..., neoforge-21.1.77.jar, quilt-server-... → başta loader + sürüm
    if (/^(forge|neoforge|quilt)-[\d]/.test(lower) || /^(forge|neoforge|quilt)-server/.test(lower)) return 'root';
    return 'mod';
}

/**
 * Yüklenen tek dosyayı akıllıca yerleştir. Kaynak, multer'ın diske yazdığı
 * geçici dosyadır (büyük zip'leri belleğe almamak için) — taşıma kopyalama ile
 * yapılır, geçici dosyayı çağıran temizler.
 * @param {string} installPath
 * @param {string} fileName  orijinal ad (basename'lenir)
 * @param {string} srcPath   diskteki geçici dosya yolu
 * @returns {{ placed: string, target: string, detail: string }}
 */
function placeFile(installPath, fileName, srcPath) {
    if (!fs.existsSync(installPath)) throw new Error('Modpack profili bulunamadı');
    const safeName = path.basename(fileName);
    const ext = path.extname(safeName).toLowerCase();

    if (ext === '.zip') {
        const curseforgeService = require('../curseforgeService');
        curseforgeService._extractZip(srcPath, installPath);
        curseforgeService._normalizeExtractedFiles(installPath);
        return { placed: safeName, target: 'kök (açıldı)', detail: 'Zip profile açıldı ve klasör yapısı düzenlendi' };
    }

    if (ext === '.jar') {
        const kind = classifyJar(safeName);
        if (kind === 'mod') {
            const modsDir = path.join(installPath, 'mods');
            if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
            fs.copyFileSync(srcPath, path.join(modsDir, safeName));
            return { placed: safeName, target: 'mods/', detail: 'Mod olarak mods/ klasörüne kondu' };
        }
        fs.copyFileSync(srcPath, path.join(installPath, safeName));
        return { placed: safeName, target: 'kök', detail: 'Sunucu/loader jar olarak köke kondu' };
    }

    // config/properties/toml/json vb. → köke
    fs.copyFileSync(srcPath, path.join(installPath, safeName));
    return { placed: safeName, target: 'kök', detail: 'Yapılandırma dosyası köke kondu' };
}

/** Profilin mevcut dosya ağacının özeti (UI'da "ne yükledim" görünümü). */
function listFiles(installPath) {
    if (!fs.existsSync(installPath)) return { root: [], mods: [] };
    const safeRead = (d) => { try { return fs.readdirSync(d).filter(f => !f.startsWith('.')); } catch { return []; } };
    return {
        root: safeRead(installPath).filter(f => {
            try { return fs.statSync(path.join(installPath, f)).isFile(); } catch { return false; }
        }),
        mods: safeRead(path.join(installPath, 'mods')).filter(f => f.endsWith('.jar')),
    };
}

module.exports = { createEmptyPack, placeFile, classifyJar, slugify, listFiles };
