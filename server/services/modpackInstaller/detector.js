const fs = require('fs');
const path = require('path');

/**
 * Phase 2-3: Paket tipi, loader ve Minecraft sürümü tespiti
 */
class Detector {
    detect(installPath) {
        const packageType = this._detectPackageType(installPath);
        const loaderInfo = this._detectLoader(installPath);
        const mcVersion = this._detectMcVersion(installPath, loaderInfo);
        const startupMode = this._detectStartupMode(loaderInfo);

        return {
            packageType,
            loader: loaderInfo.loader,
            loaderVersion: loaderInfo.loaderVersion,
            mcVersion,
            startupMode, // 'new' | 'old' | 'direct'
            requiredJava: this._getRequiredJava(mcVersion),
        };
    }

    _detectPackageType(installPath) {
        const files = this._safeReaddir(installPath);

        if (files.includes('version.json')) {
            try {
                const vData = JSON.parse(fs.readFileSync(path.join(installPath, 'version.json'), 'utf8'));
                if (vData.targets || vData.runtime) return 'ftb';
            } catch { /* ignore */ }
        }

        if (files.includes('manifest.json')) {
            try {
                const manifest = JSON.parse(fs.readFileSync(path.join(installPath, 'manifest.json'), 'utf8'));
                if (manifest.minecraft?.modLoaders) return 'curseforge';
            } catch { /* ignore */ }
        }

        return 'manual';
    }

    _detectLoader(installPath) {
        // 1. libraries/ klasörü — en güvenilir
        const librariesPath = path.join(installPath, 'libraries');
        if (fs.existsSync(librariesPath)) {
            const neoforgedPath = path.join(librariesPath, 'net', 'neoforged');
            const forgePath = path.join(librariesPath, 'net', 'minecraftforge');

            if (fs.existsSync(neoforgedPath)) {
                return { loader: 'neoforge', loaderVersion: this._extractVersionFromLibraries(neoforgedPath) };
            }
            if (fs.existsSync(forgePath)) {
                return { loader: 'forge', loaderVersion: this._extractVersionFromLibraries(forgePath) };
            }
        }

        // 2. JAR adı
        const files = this._safeReaddir(installPath);
        for (const file of files) {
            if (!file.endsWith('.jar')) continue;
            const lower = file.toLowerCase();
            if (lower.includes('neoforge') && !lower.includes('installer')) {
                return { loader: 'neoforge', loaderVersion: this._extractVersionFromJarName(file) };
            }
            if (lower.includes('forge') && !lower.includes('installer')) {
                return { loader: 'forge', loaderVersion: this._extractVersionFromJarName(file) };
            }
        }

        // 3. manifest.json
        const manifestPath = path.join(installPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                const loaderEntry = (manifest.minecraft?.modLoaders || [])[0];
                if (loaderEntry?.id) {
                    const id = loaderEntry.id.toLowerCase();
                    if (id.startsWith('neoforge-')) {
                        return { loader: 'neoforge', loaderVersion: id.replace('neoforge-', '') };
                    }
                    if (id.startsWith('forge-')) {
                        return { loader: 'forge', loaderVersion: id.replace('forge-', '') };
                    }
                }
            } catch { /* ignore */ }
        }

        return { loader: 'unknown', loaderVersion: null };
    }

    _detectMcVersion(installPath, loaderInfo) {
        // manifest.json (CurseForge)
        const manifestPath = path.join(installPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (manifest.minecraft?.version) return manifest.minecraft.version;
            } catch { /* ignore */ }
        }

        // version.json (FTB)
        const versionPath = path.join(installPath, 'version.json');
        if (fs.existsSync(versionPath)) {
            try {
                const vData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
                if (vData.id) {
                    const match = vData.id.match(/(\d+\.\d+(?:\.\d+)?)/);
                    if (match) return match[1];
                }
            } catch { /* ignore */ }
        }

        // Loader versiyonundan çıkar (örn: forge-1.20.1-47.2.0)
        if (loaderInfo.loaderVersion) {
            const match = loaderInfo.loaderVersion.match(/^(\d+\.\d+(?:\.\d+)?)/);
            if (match) return match[1];
        }

        return null;
    }

    _detectStartupMode(loaderInfo) {
        if (loaderInfo.loader === 'neoforge') return 'new';
        if (loaderInfo.loader === 'forge') {
            // Forge 37+ (MC 1.17+) → run.sh/user_jvm_args mantığı
            const mainVer = this._parseForgeMainVersion(loaderInfo.loaderVersion);
            return mainVer >= 37 ? 'new' : 'old';
        }
        return 'direct';
    }

    _getRequiredJava(mcVersion) {
        if (!mcVersion) return 21;
        const parts = mcVersion.split('.').map(Number);
        const minor = parts[1] || 0;
        const patch = parts[2] || 0;

        if (minor <= 16) return 8;
        if (minor === 17) return 16;
        if (minor >= 18 && (minor < 20 || (minor === 20 && patch < 5))) return 17;
        return 21;
    }

    _extractVersionFromLibraries(basePath) {
        try {
            const loaderDirs = fs.readdirSync(basePath);
            for (const loaderDir of loaderDirs) {
                const versionDir = path.join(basePath, loaderDir);
                if (!fs.statSync(versionDir).isDirectory()) continue;
                const versions = fs.readdirSync(versionDir);
                if (versions.length > 0) return versions[0];
            }
        } catch { /* ignore */ }
        return null;
    }

    _extractVersionFromJarName(filename) {
        // neoforge-21.1.3.jar veya forge-1.20.1-47.2.0.jar
        const match = filename.replace('.jar', '').match(/[\-_]([\d]+\.[\d]+\.?[\d]*(?:[\-\.][\d]+(?:\.[\d]+)?)?)/);
        return match ? match[1] : null;
    }

    _parseForgeMainVersion(loaderVersion) {
        if (!loaderVersion) return 0;
        // "1.20.1-47.2.0" → 47
        const match = loaderVersion.match(/[\-](\d+)\./);
        return match ? parseInt(match[1]) : 0;
    }

    _safeReaddir(dirPath) {
        try { return fs.readdirSync(dirPath); } catch { return []; }
    }
}

module.exports = new Detector();
