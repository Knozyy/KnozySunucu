const fs = require('fs');
const path = require('path');
const detector = require('./detector');
const manifestInstaller = require('./manifestInstaller');
const loaderInstaller = require('./loaderInstaller');
const scriptGenerator = require('./scriptGenerator');

/**
 * Kurulum sonrası paketi başlatılabilir hale getirir:
 * 1. Client pack ise: manifest'ten modları indir + overrides uygula
 * 2. Gerekli Java'yı garanti et
 * 3. libraries/ yoksa loader installer'ı (indirip) çalıştır
 * 4. eula.txt + başlatma scriptleri + user_jvm_args.txt
 *
 * Onarım sihirbazındaki etkileşimli akıştan farkı: her şeyi otomatik,
 * tek geçişte ve async yapar — kurulum bittiğinde sunucu gerçekten açılabilir.
 */
async function finalizeInstall(installPath, { maxRam = '4G', minRam = '2G', onProgress, log, reuseModsDir = null } = {}) {
    const emit = log || (() => {});
    const progress = (pct, status) => { if (onProgress) onProgress(pct, status); };
    const warnings = [];
    const actions = [];

    // ── 1. Manifest (client pack) kurulumu ─────────────────────────────────
    let manifest = null;
    if (manifestInstaller.isManifestPack(installPath)) {
        manifest = manifestInstaller.parseManifest(installPath);
        if (!manifestInstaller.modsLookInstalled(installPath, manifest)) {
            progress(0, 'Modlar indiriliyor (manifest)...');
            const cf = require('../curseforgeService');
            const res = await manifestInstaller.installFromManifest(installPath, {
                cf,
                log: emit,
                reuseDir: reuseModsDir,
                onProgress: (pct, status) => progress(Math.floor(pct * 0.5), status),
            });
            actions.push(`${res.downloaded} mod indirildi${res.reused ? ` (+${res.reused} önceki sürümden)` : ''}`);
            if (res.failed.length > 0) {
                warnings.push(`${res.failed.length} mod indirilemedi — eksik-modlar.txt içinde liste ve linkler var.`);
            }
        } else {
            // Server pack zaten modlarla geldi; overrides varsa yine uygula
            manifestInstaller.applyOverrides(installPath, manifest.overridesDir, emit);
        }
    }

    // ── 2. Tespit (manifest/overrides sonrası güncel durum) ────────────────
    const det = detector.detect(installPath);
    // Manifest loader bilgisi tespitten daha güvenilir (libraries henüz yokken)
    const loader = (det.loader !== 'unknown' ? det.loader : manifest?.loader?.type) || 'unknown';
    const loaderVersion = det.loaderVersion || manifest?.loader?.version || null;
    const mcVersion = det.mcVersion || manifest?.mcVersion || null;
    const requiredJava = det.requiredJava;

    // ── 3. Java garanti ─────────────────────────────────────────────────────
    progress(52, `Java ${requiredJava} kontrol ediliyor...`);
    try {
        await loaderInstaller.ensureJava(requiredJava, emit);
        actions.push(`Java ${requiredJava} hazır`);
    } catch (err) {
        warnings.push(`Java ${requiredJava} kurulamadı: ${err.message}`);
    }

    // ── 4. Loader kurulumu (libraries/ veya fabric launcher yoksa) ─────────
    const needsLoader = loader !== 'unknown' && !loaderLooksInstalled(installPath, loader);
    if (needsLoader) {
        if (loader === 'quilt') {
            warnings.push('Quilt loader otomatik kurulamıyor — installer\'ı elle çalıştırın.');
        } else if (!mcVersion || !loaderVersion) {
            warnings.push('Loader sürümü tespit edilemedi — Forge/Fabric installer elle çalıştırılmalı.');
        } else {
            progress(60, `${loader} kuruluyor...`);
            try {
                const files = fs.readdirSync(installPath);
                const localJar = files.find((f) => f.endsWith('.jar') && f.toLowerCase().includes('installer')) || null;
                await loaderInstaller.ensureLoaderInstalled({
                    installPath, loader, mcVersion, loaderVersion, requiredJava,
                    localInstallerJar: localJar, log: emit,
                });
                actions.push(`${loader} ${loaderVersion} kuruldu`);
            } catch (err) {
                warnings.push(`Loader kurulumu başarısız: ${err.message}`);
            }
        }
    }

    // ── 5. EULA + scriptler + JVM argümanları ───────────────────────────────
    progress(92, 'Başlatma dosyaları hazırlanıyor...');
    const detFinal = detector.detect(installPath); // loader kurulumu startupMode'u değiştirmiş olabilir

    if (!fs.existsSync(path.join(installPath, 'eula.txt'))) {
        fs.writeFileSync(path.join(installPath, 'eula.txt'),
            '# Knozy Sunucu Paneli tarafindan otomatik olusturuldu\n# https://aka.ms/MinecraftEULA\neula=true\n', 'utf8');
        actions.push('eula.txt oluşturuldu');
    }

    const hasScript = ['run.sh', 'start.sh', 'startserver.sh', 'ServerStart.sh']
        .some((s) => fs.existsSync(path.join(installPath, s)));
    if (!hasScript) {
        const jarName = findMainJar(installPath);
        const opts = { maxRam, minRam, jarName };
        fs.writeFileSync(path.join(installPath, 'start.sh'),
            scriptGenerator.generateStartSh(detFinal.loader, detFinal.startupMode, opts), 'utf8');
        fs.writeFileSync(path.join(installPath, 'start.bat'),
            scriptGenerator.generateStartBat(detFinal.loader, detFinal.startupMode, opts), 'utf8');
        if (process.platform !== 'win32') {
            try { fs.chmodSync(path.join(installPath, 'start.sh'), 0o755); } catch { /* ignore */ }
        }
        actions.push('start.sh / start.bat oluşturuldu');
    }

    if (detFinal.startupMode === 'new' && !fs.existsSync(path.join(installPath, 'user_jvm_args.txt'))) {
        fs.writeFileSync(path.join(installPath, 'user_jvm_args.txt'),
            scriptGenerator.generateUserJvmArgs(maxRam, minRam), 'utf8');
        actions.push('user_jvm_args.txt oluşturuldu');
    }

    progress(100, 'Kurulum sonlandırıldı');
    return { actions, warnings, loader, mcVersion, loaderVersion };
}

/** Loader'ın kurulu göründüğü durum: forge/neoforge → libraries/, fabric → launcher jar */
function loaderLooksInstalled(installPath, loader) {
    if (loader === 'fabric') {
        return fs.existsSync(path.join(installPath, 'fabric-server-launch.jar'))
            || fs.existsSync(path.join(installPath, 'fabric-server-launcher.jar'));
    }
    return fs.existsSync(path.join(installPath, 'libraries'));
}

function findMainJar(installPath) {
    try {
        const files = fs.readdirSync(installPath);
        const fabricJar = files.find((f) => /^fabric-server-launch(er)?\.jar$/.test(f));
        if (fabricJar) return fabricJar;
        for (const file of files) {
            if (!file.endsWith('.jar') || file.toLowerCase().includes('installer')) continue;
            const lower = file.toLowerCase();
            if (lower.includes('neoforge') || lower.includes('forge')) return file;
        }
        if (files.includes('server.jar')) return 'server.jar';
        const jars = files.filter((f) => f.endsWith('.jar') && !f.toLowerCase().includes('installer'));
        return jars[0] || 'server.jar';
    } catch { return 'server.jar'; }
}

module.exports = { finalizeInstall, loaderLooksInstalled, findMainJar };
