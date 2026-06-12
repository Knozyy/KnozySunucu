const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

/**
 * Loader (Forge / NeoForge / Fabric) installer'ını indirir ve çalıştırır.
 * URL üretimi saf fonksiyondur (test edilebilir); çalıştırma async spawn ile
 * yapılır ki uzun kurulumlar paneli kilitlemesin.
 */

const INSTALLER_TIMEOUT_MS = 20 * 60 * 1000; // 20 dakika (yavaş VDS + büyük paket payı)
const FABRIC_INSTALLER_FALLBACK = '1.0.1';   // meta API erişilemezse kullanılacak sürüm

/**
 * Loader installer JAR'ının indirme bilgisi.
 * @param {'forge'|'neoforge'|'fabric'} loader
 * @param {string} mcVersion       örn. "1.20.1"
 * @param {string} loaderVersion   örn. "47.2.0" | "21.1.77" | "0.16.9"
 * @param {string} [fabricInstallerVersion]
 * @returns {{ url: string, jarName: string }}
 */
function getInstallerInfo(loader, mcVersion, loaderVersion, fabricInstallerVersion) {
    if (loader === 'forge') {
        // Manifest'te "forge-47.2.0" gelir; maven koordinatı "1.20.1-47.2.0"
        const full = loaderVersion.includes('-') ? loaderVersion : `${mcVersion}-${loaderVersion}`;
        return {
            url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`,
            jarName: `forge-${full}-installer.jar`,
        };
    }
    if (loader === 'neoforge') {
        // MC 1.20.1 dönemi NeoForge "47.1.x" sürümleri eski koordinatta yaşar
        if (loaderVersion.startsWith('47.')) {
            const full = `${mcVersion}-${loaderVersion}`;
            return {
                url: `https://maven.neoforged.net/releases/net/neoforged/forge/${full}/forge-${full}-installer.jar`,
                jarName: `neoforge-${full}-installer.jar`,
            };
        }
        return {
            url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`,
            jarName: `neoforge-${loaderVersion}-installer.jar`,
        };
    }
    if (loader === 'fabric') {
        const iv = fabricInstallerVersion || FABRIC_INSTALLER_FALLBACK;
        return {
            url: `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${iv}/fabric-installer-${iv}.jar`,
            jarName: `fabric-installer-${iv}.jar`,
        };
    }
    throw new Error(`Desteklenmeyen loader: ${loader}`);
}

/** Fabric meta API'den güncel kararlı installer sürümü (erişilemezse fallback). */
function fetchFabricInstallerVersion() {
    return new Promise((resolve) => {
        const req = https.get('https://meta.fabricmc.net/v2/versions/installer', (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try {
                    const list = JSON.parse(data);
                    const stable = list.find((v) => v.stable);
                    resolve(stable?.version || FABRIC_INSTALLER_FALLBACK);
                } catch { resolve(FABRIC_INSTALLER_FALLBACK); }
            });
        });
        req.on('error', () => resolve(FABRIC_INSTALLER_FALLBACK));
        req.setTimeout(10000, () => { req.destroy(); resolve(FABRIC_INSTALLER_FALLBACK); });
    });
}

/**
 * Installer'ı async olarak çalıştırır (event loop bloke edilmez).
 * @param {object} p
 * @param {string} p.installPath
 * @param {string} p.jarPath        installer JAR tam yolu
 * @param {'forge'|'neoforge'|'fabric'} p.loader
 * @param {string} p.mcVersion
 * @param {string} p.loaderVersion
 * @param {string} p.javaPath       kullanılacak java binary'si
 * @param {(msg:string)=>void} [p.log]
 * @param {number} [p.timeoutMs]
 */
function runInstaller({ installPath, jarPath, loader, mcVersion, loaderVersion, javaPath, log, timeoutMs }) {
    const args = ['-jar', jarPath];
    if (loader === 'fabric') {
        args.push('server', '-mcversion', mcVersion, '-loader', loaderVersion, '-downloadMinecraft', '-dir', installPath);
    } else {
        args.push('--installServer', installPath);
    }

    return new Promise((resolve, reject) => {
        const child = spawn(javaPath, args, { cwd: installPath, stdio: ['ignore', 'pipe', 'pipe'] });
        let lastLine = '';

        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* ignore */ }
            reject(new Error(`Loader installer zaman aşımına uğradı (${Math.round((timeoutMs || INSTALLER_TIMEOUT_MS) / 60000)} dk). Son çıktı: ${lastLine}`));
        }, timeoutMs || INSTALLER_TIMEOUT_MS);

        const onData = (data) => {
            const text = data.toString();
            const line = text.trim().split('\n').pop();
            if (line) lastLine = line;
            if (log) {
                // Maven indirme satırları çok gürültülü; özet geç
                if (/Downloading|İndiriliyor/i.test(line)) log(`installer: ${line.slice(0, 120)}`);
                else if (line) log(`installer: ${line.slice(0, 200)}`);
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);

        child.on('error', (err) => { clearTimeout(timer); reject(new Error(`Installer başlatılamadı: ${err.message}`)); });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`Loader installer başarısız (çıkış kodu: ${code}). Son çıktı: ${lastLine}`));
        });
    });
}

/**
 * Gerekli Java'yı garanti eder; binary yolunu döndürür.
 * Öncelik: JavaManager kurulumu → uygun sistem java'sı → Adoptium'dan kur.
 */
async function ensureJava(requiredVersion, log) {
    const JavaManager = require('../javaManager');
    const jm = new JavaManager();

    const managed = jm.getJavaPath(requiredVersion);
    if (managed) return managed;

    // Sistem java'sı yeterli mi?
    try {
        const { execSync } = require('child_process');
        const out = execSync('java -version 2>&1', { timeout: 5000 }).toString();
        const m = out.match(/version "(\d+)/);
        if (m && parseInt(m[1]) === requiredVersion) return 'java';
    } catch { /* java yok */ }

    if (log) log(`Java ${requiredVersion} bulunamadı, Adoptium'dan indiriliyor...`);
    await jm.install(requiredVersion, (pct, status) => {
        if (log) log(`Java ${requiredVersion}: %${pct} — ${status}`);
    });
    const installed = jm.getJavaPath(requiredVersion);
    if (!installed) throw new Error(`Java ${requiredVersion} kurulumu doğrulanamadı`);
    return installed;
}

/**
 * Installer'ı (gerekirse indirip) çalıştırır — kurulum ve onarım akışlarının ortak yolu.
 * @param {object} p
 * @param {string} p.installPath
 * @param {'forge'|'neoforge'|'fabric'} p.loader
 * @param {string} p.mcVersion
 * @param {string} p.loaderVersion
 * @param {number} p.requiredJava
 * @param {string} [p.localInstallerJar]  zaten klasörde duran installer adı
 * @param {(msg:string)=>void} [p.log]
 */
async function ensureLoaderInstalled({ installPath, loader, mcVersion, loaderVersion, requiredJava, localInstallerJar, log }) {
    const emit = log || (() => {});
    const javaPath = await ensureJava(requiredJava, emit);

    let jarPath;
    if (localInstallerJar && fs.existsSync(path.join(installPath, localInstallerJar))) {
        jarPath = path.join(installPath, localInstallerJar);
        emit(`Yerel installer kullanılıyor: ${localInstallerJar}`);
    } else {
        if (!loaderVersion) throw new Error('Loader sürümü tespit edilemedi — installer indirilemez');
        const fabricIv = loader === 'fabric' ? await fetchFabricInstallerVersion() : null;
        const info = getInstallerInfo(loader, mcVersion, loaderVersion, fabricIv);
        jarPath = path.join(installPath, info.jarName);
        emit(`Installer indiriliyor: ${info.jarName}`);
        const curseforgeService = require('../curseforgeService');
        await curseforgeService.downloadFile(info.url, jarPath);
    }

    emit(`${loader} installer çalıştırılıyor (bu birkaç dakika sürebilir)...`);
    await runInstaller({ installPath, jarPath, loader, mcVersion, loaderVersion, javaPath, log: emit });

    try { fs.unlinkSync(jarPath); } catch { /* ignore */ }
    // Fabric installer'ın yan ürünü .json/.log dosyaları kalabilir — zararsız
    emit('Loader kurulumu tamamlandı.');
    return { javaPath };
}

module.exports = {
    getInstallerInfo,
    fetchFabricInstallerVersion,
    runInstaller,
    ensureJava,
    ensureLoaderInstalled,
    INSTALLER_TIMEOUT_MS,
    FABRIC_INSTALLER_FALLBACK,
};
