const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Phase 8: Final hazır olma kontrolü
 */
class Verifier {
    verify(installPath, detectedInfo) {
        const issues = [];
        const files = this._safeReaddir(installPath);

        // EULA
        const eulaPath = path.join(installPath, 'eula.txt');
        if (!files.includes('eula.txt')) {
            issues.push('eula.txt eksik');
        } else {
            try {
                const content = fs.readFileSync(eulaPath, 'utf8');
                if (!content.includes('eula=true')) issues.push('EULA kabul edilmemiş');
            } catch { /* ignore */ }
        }

        // Başlatma scripti
        const scripts = ['run.sh', 'run.bat', 'start.sh', 'start.bat', 'ServerStart.sh', 'ServerStart.bat'];
        if (!scripts.some(s => files.includes(s))) {
            issues.push('Başlatma scripti bulunamadı');
        }

        // Libraries (Forge/NeoForge)
        if (detectedInfo.loader !== 'unknown') {
            const libPath = path.join(installPath, 'libraries');
            if (!fs.existsSync(libPath)) {
                issues.push('libraries/ klasörü yok');
            }
        }

        // Java
        if (detectedInfo.requiredJava) {
            const JavaManager = require('../javaManager');
            const jm = new JavaManager();
            let javaOk = jm.isVersionInstalled(detectedInfo.requiredJava);
            if (!javaOk) {
                try {
                    const out = execSync('java -version 2>&1', { timeout: 3000 }).toString();
                    const match = out.match(/version "(\d+)/);
                    javaOk = match && parseInt(match[1]) >= detectedInfo.requiredJava;
                } catch { /* ignore */ }
            }
            if (!javaOk) issues.push(`Java ${detectedInfo.requiredJava} kurulu değil`);
        }

        return {
            ready: issues.length === 0,
            issues,
            summary: issues.length === 0
                ? 'Sunucu başlatılmaya hazır!'
                : `${issues.length} sorun var, sunucu başlatılamayabilir.`,
        };
    }

    _safeReaddir(dirPath) {
        try { return fs.readdirSync(dirPath); } catch { return []; }
    }
}

module.exports = new Verifier();
