const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const CURSEFORGE_API_BASE = 'https://api.curseforge.com';
const MINECRAFT_GAME_ID = 432;
const MODPACK_CLASS_ID = 4471;

// Global install status
let installStatus = {
    isInstalling: false,
    progress: 0,
    task: '',
    status: '',
    error: null,
};

class CurseForgeService {
    getApiKey() {
        return process.env.CURSEFORGE_API_KEY || '';
    }

    getInstallStatus() {
        return { ...installStatus };
    }

    resetInstallStatus() {
        installStatus = { isInstalling: false, progress: 0, task: '', status: '', error: null };
    }

    _updateProgress(task, progress, status) {
        installStatus = { isInstalling: true, progress, task, status, error: null };
    }

    _setError(error) {
        installStatus = { isInstalling: false, progress: 0, task: 'Hata', status: error, error };
    }

    async apiRequest(endpoint) {
        const apiKey = this.getApiKey();
        if (!apiKey || apiKey === 'your_api_key_here') {
            throw new Error('CurseForge API key ayarlanmamış. .env dosyasını kontrol edin.');
        }

        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, CURSEFORGE_API_BASE);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'x-api-key': apiKey,
                },
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error('API yanıtı parse edilemedi'));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.setTimeout(15000, () => {
                req.destroy(new Error('API isteği zaman aşımına uğradı'));
            });
            req.end();
        });
    }

    async searchModpacks(query, pageSize = 20) {
        const params = new URLSearchParams({
            gameId: MINECRAFT_GAME_ID,
            classId: MODPACK_CLASS_ID,
            searchFilter: query,
            pageSize: pageSize.toString(),
            sortField: '2',
            sortOrder: 'desc',
        });

        const result = await this.apiRequest(`/v1/mods/search?${params}`);
        return (result.data || []).map(mod => this._mapModpack(mod));
    }

    async getPopularModpacks(pageSize = 20) {
        const params = new URLSearchParams({
            gameId: MINECRAFT_GAME_ID,
            classId: MODPACK_CLASS_ID,
            pageSize: pageSize.toString(),
            sortField: '2',
            sortOrder: 'desc',
        });

        const result = await this.apiRequest(`/v1/mods/search?${params}`);
        return (result.data || []).map(mod => this._mapModpack(mod));
    }

    async getModpackDetails(modId) {
        const result = await this.apiRequest(`/v1/mods/${modId}`);
        return result.data;
    }

    async getModpackFiles(modId) {
        const result = await this.apiRequest(`/v1/mods/${modId}/files`);
        return (result.data || []).map(f => ({
            id: f.id,
            displayName: f.displayName,
            fileName: f.fileName,
            gameVersions: f.gameVersions,
            downloadUrl: f.downloadUrl,
            fileLength: f.fileLength,
            fileDate: f.fileDate,
            serverPackFileId: f.serverPackFileId || null,
        }));
    }

    async getFileDetails(modId, fileId) {
        const result = await this.apiRequest(`/v1/mods/${modId}/files/${fileId}`);
        return result.data;
    }

    _mapModpack(mod) {
        return {
            id: mod.id,
            name: mod.name,
            summary: mod.summary,
            author: mod.authors?.[0]?.name || 'Bilinmiyor',
            downloadCount: mod.downloadCount,
            logoUrl: mod.logo?.url || null,
            categories: mod.categories?.map(c => c.name) || [],
            dateModified: mod.dateModified,
            latestFiles: (mod.latestFiles || []).slice(0, 5).map(f => ({
                id: f.id,
                displayName: f.displayName,
                fileName: f.fileName,
                gameVersions: f.gameVersions,
                downloadUrl: f.downloadUrl,
                fileDate: f.fileDate,
                serverPackFileId: f.serverPackFileId || null,
            })),
        };
    }

    downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            if (!url) { reject(new Error('İndirme URL\'si bulunamadı')); return; }

            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const followRedirect = (downloadUrl) => {
                const protocol = downloadUrl.startsWith('https') ? https : http;
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
                            const pct = Math.floor((downloaded / total) * 100);
                            onProgress(pct, downloaded, total);
                        }
                    });

                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(destPath); });
                }).on('error', (err) => {
                    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
                    reject(err);
                });
            };
            followRedirect(url);
        });
    }

    /**
     * Modpack yükleme - ilerleme takipli
     */
    async installModpack(modId, fileId) {
        if (installStatus.isInstalling) {
            throw new Error('Zaten bir kurulum devam ediyor');
        }

        try {
            const db = getDb();
            const baseServerPath = process.env.MINECRAFT_SERVER_PATH || path.join(__dirname, '../../sunucular');

            // 1. Bilgi al
            this._updateProgress('Bilgi Alınıyor', 5, 'Modpack bilgileri alınıyor...');
            const modDetails = await this.getModpackDetails(modId);
            const files = await this.getModpackFiles(modId);
            const selectedFile = files.find(f => f.id === fileId) || files[0];

            if (!selectedFile) throw new Error('Dosya bulunamadı');

            // Profil klasör adı (slug)
            const slug = modDetails.slug || modDetails.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const profilePath = path.join(baseServerPath, slug);

            // 2. Server Pack kontrolü
            this._updateProgress('İndirme Hazırlığı', 10, 'İndirme linki kontrol ediliyor...');
            let downloadUrl = null;
            let isServerPack = false;

            if (selectedFile.serverPackFileId) {
                try {
                    const serverFile = await this.getFileDetails(modId, selectedFile.serverPackFileId);
                    if (serverFile && serverFile.downloadUrl) {
                        downloadUrl = serverFile.downloadUrl;
                        isServerPack = true;
                        this._updateProgress('Server Pack', 12, 'Server pack bulundu, indiriliyor...');
                    }
                } catch { /* fallback to normal */ }
            }

            if (!downloadUrl) {
                downloadUrl = selectedFile.downloadUrl;
            }

            if (!downloadUrl) {
                throw new Error('Bu modpack\'in indirme URL\'si mevcut değil.');
            }

            // 3. Profil dizinini hazırla
            this._updateProgress('Dizin Hazırlığı', 15, `Profil klasörü: ${slug}/`);
            if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
            const modsDir = path.join(profilePath, 'mods');
            if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

            // 4. İndir
            this._updateProgress('İndiriliyor', 20, 'Modpack indiriliyor...');
            const destPath = path.join(profilePath, selectedFile.fileName);
            await this.downloadFile(downloadUrl, destPath, (pct, downloaded, total) => {
                const overallPct = 20 + Math.floor(pct * 0.5);
                const dlMB = (downloaded / 1024 / 1024).toFixed(1);
                const totalMB = (total / 1024 / 1024).toFixed(1);
                this._updateProgress('İndiriliyor', overallPct, `${dlMB} / ${totalMB} MB`);
            });

            // 5. Arşivi Çıkart
            if (destPath.endsWith('.zip')) {
                this._updateProgress('Çıkartılıyor', 75, 'Sunucu dosyaları çıkartılıyor...');
                try {
                    const { execSync } = require('child_process');
                    if (process.platform === 'win32') {
                        execSync(`tar -xf "${destPath}" -C "${profilePath}"`);
                    } else {
                        execSync(`unzip -o "${destPath}" -d "${profilePath}"`);
                    }
                    fs.unlinkSync(destPath);
                } catch (err) {
                    console.error('Arşiv çıkartma hatası:', err);
                    throw new Error('Dosyalar çıkartılamadı ("unzip" hatası).');
                }
            }

            // 6. İlk kurulumsa aktif yap
            const existingActive = db.prepare('SELECT id FROM installed_modpacks WHERE is_active = 1').get();
            const isFirstInstall = !existingActive;

            // 7. Veritabanını güncelle (curseforge_file_id ve file_display_name dahil)
            this._updateProgress('Kayıt', 90, 'Veritabanı güncelleniyor...');
            const stmt = db.prepare(`
                INSERT INTO installed_modpacks (curseforge_id, name, version, author, logo_url, install_path, is_active, status, curseforge_file_id, file_display_name) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'installed', ?, ?)
            `);

            stmt.run(
                modId,
                modDetails.name,
                selectedFile.displayName,
                modDetails.authors?.[0]?.name || 'Bilinmiyor',
                modDetails.logo?.url || null,
                profilePath,
                isFirstInstall ? 1 : 0,
                selectedFile.id,
                selectedFile.displayName,
            );

            // 8. Tamamlandı
            installStatus = {
                isInstalling: false,
                progress: 100,
                task: 'Tamamlandı',
                status: `Kurulum tamamlandı! (${slug}/)`,
                error: null,
            };

            return {
                name: modDetails.name,
                version: selectedFile.displayName,
                fileName: selectedFile.fileName,
                isServerPack,
                profilePath,
                slug,
            };
        } catch (error) {
            this._setError(error.message);
            throw error;
        }
    }

    /**
     * Güncelleme kontrolü — curseforge_file_id karşılaştırmasıyla daha güvenilir
     */
    async checkUpdate(modpackId) {
        const db = getDb();
        const installed = db.prepare('SELECT * FROM installed_modpacks WHERE curseforge_id = ?').get(modpackId);
        if (!installed) return { hasUpdate: false };

        try {
            const files = await this.getModpackFiles(modpackId);
            if (!files || files.length === 0) return { hasUpdate: false };

            const latestFile = files[0];

            // curseforge_file_id varsa ona göre karşılaştır (en güvenilir yol)
            if (installed.curseforge_file_id) {
                const hasUpdate = latestFile.id !== installed.curseforge_file_id;
                return {
                    hasUpdate,
                    currentVersion: installed.file_display_name || installed.version,
                    latestVersion: latestFile.displayName,
                    latestFileId: latestFile.id,
                    dbId: installed.id,
                    modId: modpackId,
                };
            }

            // Fallback: isim karşılaştırması
            const currentObj = (installed.version || '').trim().toLowerCase();
            const latestObj = latestFile.displayName.trim().toLowerCase();
            const hasUpdate = (currentObj !== latestObj) && (!currentObj.includes(latestObj) && !latestObj.includes(currentObj));

            return {
                hasUpdate,
                currentVersion: installed.version,
                latestVersion: latestFile.displayName,
                latestFileId: latestFile.id,
                dbId: installed.id,
                modId: modpackId,
            };
        } catch {
            return { hasUpdate: false };
        }
    }

    /**
     * Modpack güncelleme (dünya koruyarak)
     */
    async updateModpack(dbId, modId, fileId) {
        const db = getDb();
        const existing = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(dbId);
        const serverPath = existing?.install_path || (process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server');

        // Korunacak dosyalar
        const preserveDirs = ['world', 'world_nether', 'world_the_end', 'backups'];
        const preserveFiles = ['server.properties', 'whitelist.json', 'ops.json', 'banned-players.json', 'banned-ips.json', 'eula.txt'];

        this._updateProgress('Yedekleme', 5, 'Korunan dosyalar yedekleniyor...');

        // Geçici dizine taşı
        const tempDir = path.join(serverPath, '..', 'temp_preserve');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        for (const dir of preserveDirs) {
            const src = path.join(serverPath, dir);
            if (fs.existsSync(src)) {
                const dest = path.join(tempDir, dir);
                fs.cpSync(src, dest, { recursive: true });
            }
        }
        for (const file of preserveFiles) {
            const src = path.join(serverPath, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(tempDir, file));
            }
        }

        // Eski modpack'i kaldır (sadece DB - dosyalar zaten üzerine yazılacak)
        this._updateProgress('Temizlik', 15, 'Eski modpack temizleniyor...');
        const wasActive = existing?.is_active === 1;
        db.prepare('DELETE FROM installed_modpacks WHERE id = ?').run(dbId);

        // Eski dosyaları temizle (mods, config vs - dünyalar hariç)
        try {
            const items = fs.readdirSync(serverPath);
            for (const item of items) {
                if (preserveDirs.includes(item)) continue;
                if (preserveFiles.includes(item)) continue;
                if (item === '..') continue;
                const itemPath = path.join(serverPath, item);
                try {
                    const stat = fs.lstatSync(itemPath);
                    if (stat.isDirectory()) {
                        fs.rmSync(itemPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(itemPath);
                    }
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }

        // Yeni modpack'i kur
        await this.installModpack(modId, fileId);

        // Yeni kurulan profili aktif yap (eskisi aktifse)
        if (wasActive) {
            const newProfile = db.prepare('SELECT id FROM installed_modpacks WHERE curseforge_id = ? ORDER BY id DESC LIMIT 1').get(modId);
            if (newProfile) {
                db.prepare('UPDATE installed_modpacks SET is_active = 0').run();
                db.prepare('UPDATE installed_modpacks SET is_active = 1 WHERE id = ?').run(newProfile.id);
            }
        }

        // Korunan dosyaları geri yükle
        this._updateProgress('Geri Yükleme', 95, 'Korunan dosyalar geri yükleniyor...');
        for (const dir of preserveDirs) {
            const src = path.join(tempDir, dir);
            if (fs.existsSync(src)) {
                const dest = path.join(serverPath, dir);
                if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
                fs.cpSync(src, dest, { recursive: true });
            }
        }
        for (const file of preserveFiles) {
            const src = path.join(tempDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(serverPath, file));
            }
        }

        // Temizle
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }

        installStatus = {
            isInstalling: false, progress: 100,
            task: 'Tamamlandı', status: 'Güncelleme tamamlandı!', error: null,
        };

        return { message: 'Modpack güncellendi' };
    }

    /**
     * Modpack kaldırma — dosyaları da siler
     */
    async uninstallModpack(dbId) {
        const db = getDb();
        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(dbId);
        if (!modpack) throw new Error('Modpack bulunamadı');

        // Dosyaları sil
        if (modpack.install_path && fs.existsSync(modpack.install_path)) {
            try {
                fs.rmSync(modpack.install_path, { recursive: true, force: true });
            } catch (err) {
                console.error(`[Modpacks] Dosya silme hatası: ${err.message}`);
            }
        }

        // DB kaydını sil
        db.prepare('DELETE FROM installed_modpacks WHERE id = ?').run(dbId);
        return { message: `${modpack.name} kaldırıldı (dosyalar silindi)` };
    }

    getInstalledModpacks() {
        const db = getDb();
        return db.prepare('SELECT * FROM installed_modpacks ORDER BY installed_at DESC').all();
    }
}

module.exports = new CurseForgeService();
