const fs = require('fs');
const path = require('path');
const detector = require('./detector');
const scriptGenerator = require('./scriptGenerator');

/**
 * Panel ayarlarını (RAM / JVM argümanları) diske senkronlar.
 *
 * Tek doğruluk kaynağı DB'dir (installed_modpacks.min_ram/max_ram/jvm_args).
 * Sorun şuydu: ayarlar DB'ye yazılıyordu ama başlatma script üzerinden
 * yapıldığında script/user_jvm_args.txt kurulum anındaki eski değerlerle
 * kalıyordu — panel ayarı hiç etki etmiyordu.
 *
 * Bu modül hem ayar kaydedilirken hem de her sunucu başlatmasında çağrılır:
 * - startupMode 'new' (Forge 37+/NeoForge): user_jvm_args.txt yeniden yazılır
 *   (Forge'un run.sh'ı bu dosyayı her açılışta okur)
 * - Panel imzalı start.sh/start.bat: güncel değerlerle yeniden üretilir
 * - Paketin kendi scripti (startserver.sh vb.) eski modda: dokunulmaz, uyarı döner
 */

const PANEL_MARKER = 'Knozy Sunucu Paneli taraf';

/**
 * @param {string} installPath
 * @param {{ maxRam?: string, minRam?: string, jvmArgs?: string }} settings
 * @returns {{ applied: string[], warnings: string[] }}
 */
function sync(installPath, settings = {}) {
    const applied = [];
    const warnings = [];

    if (!installPath || !fs.existsSync(installPath)) {
        return { applied, warnings: ['Kurulum yolu bulunamadı'] };
    }

    const maxRam = settings.maxRam || '4G';
    const minRam = settings.minRam || '2G';
    const jvmArgs = settings.jvmArgs || '';

    let det;
    try { det = detector.detect(installPath); }
    catch { return { applied, warnings: ['Paket tespiti başarısız'] }; }

    // ── user_jvm_args.txt (modern Forge/NeoForge bunu her açılışta okur) ────
    if (det.startupMode === 'new') {
        try {
            fs.writeFileSync(
                path.join(installPath, 'user_jvm_args.txt'),
                scriptGenerator.generateUserJvmArgs(maxRam, minRam, jvmArgs),
                'utf8'
            );
            applied.push(`user_jvm_args.txt güncellendi (-Xmx${maxRam})`);
        } catch (err) {
            warnings.push(`user_jvm_args.txt yazılamadı: ${err.message}`);
        }
    }

    // ── Panel imzalı scriptleri güncel değerlerle yeniden üret ──────────────
    const shPath = path.join(installPath, 'start.sh');
    const batPath = path.join(installPath, 'start.bat');
    const shIsOurs = _hasMarker(shPath);
    const batIsOurs = _hasMarker(batPath);

    if (shIsOurs || batIsOurs) {
        const { findMainJar } = require('./finalizer');
        const opts = { maxRam, minRam, jarName: findMainJar(installPath) };
        try {
            if (shIsOurs) {
                fs.writeFileSync(shPath, scriptGenerator.generateStartSh(det.loader, det.startupMode, opts), 'utf8');
                if (process.platform !== 'win32') {
                    try { fs.chmodSync(shPath, 0o755); } catch { /* ignore */ }
                }
            }
            if (batIsOurs) {
                fs.writeFileSync(batPath, scriptGenerator.generateStartBat(det.loader, det.startupMode, opts), 'utf8');
            }
            applied.push('başlatma scriptleri güncellendi');
        } catch (err) {
            warnings.push(`Script güncellenemedi: ${err.message}`);
        }
    }

    // ── Eski modda paketin kendi scripti varsa RAM oraya işlenemez ──────────
    if (det.startupMode !== 'new' && !shIsOurs && !batIsOurs) {
        const packScripts = ['run.sh', 'startserver.sh', 'ServerStart.sh', 'start.sh']
            .filter(s => fs.existsSync(path.join(installPath, s)) && !_hasMarker(path.join(installPath, s)));
        if (packScripts.length > 0) {
            warnings.push(
                `RAM ayarları ${packScripts[0]} içinde sabit — paket kendi scriptini kullanıyor, ` +
                'panel değerleri uygulanamadı. Scripti silersen panel kendi scriptini üretir.'
            );
        }
    }

    return { applied, warnings };
}

function _hasMarker(filePath) {
    try { return fs.readFileSync(filePath, 'utf8').includes(PANEL_MARKER); }
    catch { return false; }
}

module.exports = { sync, PANEL_MARKER };
