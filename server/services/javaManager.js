const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Java Manager - Minecraft sürümüne göre Java yönetimi
 */
class JavaManager {
    constructor() {
        this.javaDir = path.resolve(process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server', '..', 'java');
    }

    // MC sürümüne göre gereken Java
    static JAVA_REQUIREMENTS = {
        '1.7': 8, '1.8': 8, '1.9': 8, '1.10': 8, '1.11': 8, '1.12': 8,
        '1.13': 8, '1.14': 8, '1.15': 8, '1.16': 8,
        '1.17': 16,
        '1.18': 17, '1.19': 17, '1.20': 17,
        '1.20.5': 21, '1.20.6': 21, '1.21': 21,
    };

    getRequiredVersion(mcVersion) {
        const parts = mcVersion.split('.');
        // Tam eşleşme
        if (JavaManager.JAVA_REQUIREMENTS[mcVersion]) {
            return JavaManager.JAVA_REQUIREMENTS[mcVersion];
        }
        // major.minor
        const key = `${parts[0]}.${parts[1]}`;
        return JavaManager.JAVA_REQUIREMENTS[key] || 21;
    }

    listInstalled() {
        if (!fs.existsSync(this.javaDir)) return [];
        const items = [];
        for (const dir of fs.readdirSync(this.javaDir)) {
            const javaPath = this._findJavaBinary(path.join(this.javaDir, dir));
            if (javaPath) {
                const versionMatch = dir.match(/(\d+)/);
                items.push({
                    version: versionMatch ? versionMatch[1] : dir,
                    path: javaPath,
                });
            }
        }
        return items;
    }

    isVersionInstalled(version) {
        return this.listInstalled().some(j => j.version === String(version));
    }

    getJavaPath(version) {
        const found = this.listInstalled().find(j => j.version === String(version));
        return found ? found.path : null;
    }

    async install(version, onProgress) {
        if (!fs.existsSync(this.javaDir)) {
            fs.mkdirSync(this.javaDir, { recursive: true });
        }

        const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
        const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';

        if (onProgress) onProgress(10, 'İndirme linki alınıyor...');

        const downloadUrl = await this._getDownloadUrl(version, os, arch);
        if (!downloadUrl) throw new Error(`Java ${version} indirme linki bulunamadı`);

        const ext = os === 'windows' ? '.zip' : '.tar.gz';
        const downloadPath = path.join(this.javaDir, `java-${version}${ext}`);
        const extractDir = path.join(this.javaDir, `java-${version}`);

        if (onProgress) onProgress(20, 'İndiriliyor...');
        await this._downloadFile(downloadUrl, downloadPath, onProgress);

        if (onProgress) onProgress(70, 'Çıkarılıyor...');
        if (ext === '.tar.gz') {
            if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
            execSync(`tar -xzf "${downloadPath}" -C "${extractDir}"`, { timeout: 120000 });
        } else {
            // For Windows zip - use built-in extract
            const AdmZip = require('adm-zip'); // Optional, fallback to unzip
            try {
                const zip = new AdmZip(downloadPath);
                zip.extractAllTo(extractDir, true);
            } catch {
                execSync(`powershell Expand-Archive -Path "${downloadPath}" -DestinationPath "${extractDir}" -Force`, { timeout: 120000 });
            }
        }

        // Temizlik
        try { fs.unlinkSync(downloadPath); } catch { /* ignore */ }

        if (onProgress) onProgress(100, 'Java kurulumu tamamlandı!');
        return true;
    }

    cleanup(keepVersion) {
        if (!fs.existsSync(this.javaDir)) return [];
        const removed = [];
        for (const dir of fs.readdirSync(this.javaDir)) {
            const versionMatch = dir.match(/(\d+)/);
            if (versionMatch && versionMatch[1] !== String(keepVersion)) {
                const fullPath = path.join(this.javaDir, dir);
                if (fs.statSync(fullPath).isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    removed.push(dir);
                }
            }
        }
        return removed;
    }

    _findJavaBinary(dir) {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
        const binNames = process.platform === 'win32' ? ['java.exe'] : ['java'];
        // Recursive search for bin/java
        const search = (current) => {
            try {
                const items = fs.readdirSync(current);
                for (const item of items) {
                    const full = path.join(current, item);
                    if (fs.statSync(full).isDirectory()) {
                        if (item === 'bin') {
                            for (const bin of binNames) {
                                const javaPath = path.join(full, bin);
                                if (fs.existsSync(javaPath)) return javaPath;
                            }
                        }
                        const found = search(full);
                        if (found) return found;
                    }
                }
            } catch { /* ignore */ }
            return null;
        };
        return search(dir);
    }

    _getDownloadUrl(version, os, arch) {
        return new Promise((resolve, reject) => {
            const url = `https://api.adoptium.net/v3/assets/feature_releases/${version}/ga?os=${os}&architecture=${arch}&image_type=jre&jvm_impl=hotspot`;
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed && parsed.length > 0) {
                            resolve(parsed[0].binary.package.link);
                        } else {
                            resolve(null);
                        }
                    } catch { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
    }

    _downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            const followRedirect = (downloadUrl) => {
                const protocol = downloadUrl.startsWith('https') ? https : require('http');
                protocol.get(downloadUrl, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        followRedirect(response.headers.location);
                        return;
                    }
                    const total = parseInt(response.headers['content-length'] || '0');
                    let downloaded = 0;
                    const file = fs.createWriteStream(destPath);
                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                        if (total > 0 && onProgress) {
                            const pct = 20 + Math.floor((downloaded / total) * 50);
                            onProgress(pct, `İndiriliyor... ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
                        }
                    });
                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                }).on('error', reject);
            };
            followRedirect(url);
        });
    }
}

module.exports = JavaManager;
