const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Phase 4: Tüm eksiklikleri tespit et ve sorun listesi döndür
 */
class Validator {
    validate(installPath, detectedInfo) {
        const files = this._safeReaddir(installPath);
        const issues = [
            ...this._checkEula(installPath, files),
            ...this._checkStartScript(installPath, files, detectedInfo),
            ...this._checkLibraries(installPath, files, detectedInfo),
            ...this._checkJvmArgs(installPath, files, detectedInfo),
            ...this._checkScriptContent(installPath, files),
            ...this._checkJava(detectedInfo),
            ...this._checkModsDir(installPath, files),
        ];
        return issues;
    }

    _checkEula(installPath, files) {
        const eulaPath = path.join(installPath, 'eula.txt');
        if (!files.includes('eula.txt')) {
            return [{
                id: 'missing_eula',
                severity: 'warning',
                title: 'eula.txt eksik',
                description: 'Sunucu başlamadan önce EULA kabul edilmesi gerekiyor',
                action: "eula=true içeren eula.txt oluşturulacak",
                canSkip: true,
            }];
        }
        try {
            const content = fs.readFileSync(eulaPath, 'utf8');
            if (!content.includes('eula=true')) {
                return [{
                    id: 'eula_not_accepted',
                    severity: 'warning',
                    title: 'EULA kabul edilmemiş',
                    description: 'eula.txt mevcut ama eula=true satırı yok',
                    action: "eula.txt'ye eula=true yazılacak",
                    canSkip: true,
                }];
            }
        } catch { /* ignore */ }
        return [];
    }

    _checkStartScript(installPath, files, detectedInfo) {
        const scripts = ['run.sh', 'run.bat', 'start.sh', 'start.bat', 'ServerStart.sh', 'ServerStart.bat', 'startserver.sh', 'startserver.bat'];
        const found = scripts.filter(s => files.includes(s));
        if (found.length > 0) return [];

        const loaderLabel = detectedInfo.loader === 'neoforge' ? 'NeoForge' : detectedInfo.loader === 'forge' ? 'Forge' : 'Sunucu';
        return [{
            id: 'missing_start_script',
            severity: 'error',
            title: 'Başlatma scripti bulunamadı',
            description: 'run.sh, start.sh gibi hiçbir başlatma scripti yok',
            action: `${loaderLabel} için start.sh ve start.bat üretilecek`,
            canSkip: true,
        }];
    }

    _checkLibraries(installPath, files, detectedInfo) {
        if (detectedInfo.loader === 'unknown') return [];

        const libPath = path.join(installPath, 'libraries');
        if (files.includes('libraries') && fs.existsSync(libPath)) return [];

        // libraries yok — installer JAR var mı?
        const installerJar = this._findInstallerJar(files);
        if (installerJar) {
            return [{
                id: 'installer_not_run',
                severity: 'error',
                title: 'Forge installer çalıştırılmamış',
                description: `${installerJar} bulundu ama libraries/ klasörü yok`,
                action: `${installerJar} --installServer çalıştırılacak`,
                canSkip: false,
                meta: { installerJar },
            }];
        }

        return [{
            id: 'missing_libraries',
            severity: 'error',
            title: 'libraries/ klasörü yok',
            description: 'Forge/NeoForge kütüphaneleri eksik, sunucu başlamaz',
            action: 'Installer JAR bulunamadı — manuel kurulum gerekebilir',
            canSkip: false,
        }];
    }

    _checkJvmArgs(installPath, files, detectedInfo) {
        if (detectedInfo.startupMode !== 'new') return [];
        if (files.includes('user_jvm_args.txt')) return [];
        return [{
            id: 'missing_jvm_args',
            severity: 'warning',
            title: 'user_jvm_args.txt eksik',
            description: 'Yeni Forge/NeoForge sürümleri bu dosyadan JVM argümanlarını okur',
            action: 'Varsayılan RAM ayarlarıyla user_jvm_args.txt oluşturulacak',
            canSkip: true,
        }];
    }

    _checkScriptContent(installPath, files) {
        const issues = [];
        const toCheck = ['run.sh', 'start.sh'];
        for (const name of toCheck) {
            if (!files.includes(name)) continue;
            const scriptPath = path.join(installPath, name);
            try {
                const content = fs.readFileSync(scriptPath);
                if (content.includes('\r\n')) {
                    issues.push({
                        id: `crlf_${name}`,
                        severity: 'error',
                        title: `${name} Windows satır sonu (CRLF) içeriyor`,
                        description: "Linux/macOS'ta çalışmaz, LF'e dönüştürülmeli",
                        action: `${name}: CRLF → LF dönüştürülecek`,
                        canSkip: true,
                        meta: { scriptName: name },
                    });
                }
                if (process.platform !== 'win32') {
                    const stat = fs.statSync(scriptPath);
                    if (!(stat.mode & 0o111)) {
                        issues.push({
                            id: `not_executable_${name}`,
                            severity: 'warning',
                            title: `${name} çalıştırma izni yok`,
                            description: 'Scripti çalıştırmak için chmod +x gerekli',
                            action: `${name} için chmod +x verilecek`,
                            canSkip: true,
                            meta: { scriptName: name },
                        });
                    }
                }
            } catch { /* ignore */ }
        }
        return issues;
    }

    _checkJava(detectedInfo) {
        if (!detectedInfo.requiredJava) return [];

        // Global JavaManager kontrolü
        const JavaManager = require('../javaManager');
        const jm = new JavaManager();
        if (jm.isVersionInstalled(detectedInfo.requiredJava)) return [];

        // Sistem Java'sı yeterli mi?
        let systemVersion = null;
        try {
            const out = execSync('java -version 2>&1', { timeout: 5000 }).toString();
            const match = out.match(/version "(\d+)/);
            systemVersion = match ? parseInt(match[1]) : null;
        } catch { /* java not found */ }

        if (systemVersion !== null && systemVersion >= detectedInfo.requiredJava) return [];

        const sizes = { 8: '~100MB', 16: '~160MB', 17: '~180MB', 21: '~200MB' };
        const size = sizes[detectedInfo.requiredJava] || '~200MB';

        return [{
            id: 'java_missing',
            severity: 'error',
            title: `Java ${detectedInfo.requiredJava} gerekli ama kurulu değil`,
            description: systemVersion
                ? `Sistemde Java ${systemVersion} var, bu modpack Java ${detectedInfo.requiredJava} istiyor`
                : `Java bulunamadı, bu modpack Java ${detectedInfo.requiredJava} istiyor`,
            action: `Adoptium'dan Java ${detectedInfo.requiredJava} JRE indirilecek (${size})`,
            canSkip: false,
            meta: { requiredVersion: detectedInfo.requiredJava },
        }];
    }

    _checkModsDir(installPath, files) {
        const modsPath = path.join(installPath, 'mods');
        if (files.includes('mods') && fs.existsSync(modsPath)) return [];
        return [{
            id: 'missing_mods_dir',
            severity: 'warning',
            title: 'mods/ klasörü yok',
            description: 'Modpack mods klasörü bulunamadı',
            action: 'Boş mods/ klasörü oluşturulacak',
            canSkip: true,
        }];
    }

    _findInstallerJar(files) {
        return files.find(f => f.endsWith('.jar') && f.toLowerCase().includes('installer')) || null;
    }

    _safeReaddir(dirPath) {
        try { return fs.readdirSync(dirPath); } catch { return []; }
    }
}

module.exports = new Validator();
