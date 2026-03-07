const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');
const { spawn } = require('child_process');

// Global install status mapping for FTB
let installStatus = {
    isInstalling: false,
    progress: 0,
    task: '',
    status: '',
    error: null,
};

class FtbService {
    constructor() {
        this.dataPath = path.join(__dirname, '../data/ftb_modpacks.json');
        this.modpacks = [];
        this._loadModpacks();
    }

    _loadModpacks() {
        try {
            if (fs.existsSync(this.dataPath)) {
                this.modpacks = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
            } else {
                console.warn('[FTB] ftb_modpacks.json bulunamadı. Lütfen "node scripts/fetchFtb.js" çalıştırın.');
            }
        } catch (err) {
            console.error('[FTB] Modpack yükleme hatası:', err.message);
        }
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
        console.error(`[FTB Install Error] ${error}`);
    }

    async searchModpacks(query) {
        if (!query) return this.getPopularModpacks(20);

        const lowerQuery = query.toLowerCase();
        const results = this.modpacks.filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.description && p.description.toLowerCase().includes(lowerQuery))
        );

        return results.slice(0, 20).map(mod => this._mapModpack(mod));
    }

    async getPopularModpacks(pageSize = 20) {
        // Sort by plays if available, otherwise by installs
        const sorted = [...this.modpacks].sort((a, b) => (b.plays || b.installs || 0) - (a.plays || a.installs || 0));
        return sorted.slice(0, pageSize).map(mod => this._mapModpack(mod));
    }

    async getModpackDetails(modId) {
        const mod = this.modpacks.find(p => p.id === parseInt(modId));
        if (!mod) throw new Error('FTB modpack bulunamadı (JSON)');
        return mod;
    }

    async getModpackFiles(modId) {
        const mod = await this.getModpackDetails(modId);
        // Map to curseforge format for the frontend
        return (mod.versions || []).map(v => ({
            id: v.id,
            displayName: v.name,
            fileName: `${mod.name} - ${v.name}`,
            gameVersions: [], // FTB API does not directly expose this without deeper requests
            downloadUrl: null, // We use the installer, not direct downloads
            fileLength: 0, // Unknown ahead of time
            fileDate: v.updated ? new Date(v.updated * 1000).toISOString() : new Date().toISOString(),
        })).sort((a, b) => b.id - a.id); // Descending ID
    }

    _mapModpack(mod) {
        return {
            id: mod.id,
            name: mod.name,
            summary: mod.description,
            author: 'Feed The Beast',
            downloadCount: mod.installs || mod.plays,
            logoUrl: `https://api.modpacks.ch/public/modpack/${mod.id}/art/logo`,
            categories: ['FTB'],
            dateModified: mod.updated ? new Date(mod.updated * 1000).toISOString() : new Date().toISOString(),
            latestFiles: (mod.versions || []).slice(0, 5).map(f => ({
                id: f.id,
                displayName: f.name,
                fileDate: f.updated ? new Date(f.updated * 1000).toISOString() : new Date().toISOString(),
            })).sort((a, b) => b.id - a.id)
        };
    }

    async _downloadInstaller(platform, modId, fileId) {
        const fs = require('fs');
        const path = require('path');
        let url = '';
        let binName = '';
        const platformStr = platform === 'win32' ? 'windows' : 'linux';

        if (platform === 'win32') {
            url = `https://api.modpacks.ch/public/modpack/${modId}/${fileId}/server/windows`;
            binName = `serverinstall_${modId}_${fileId}_windows.exe`;
        } else {
            url = `https://api.modpacks.ch/public/modpack/${modId}/${fileId}/server/linux`;
            binName = `serverinstall_${modId}_${fileId}_linux`;
        }

        const binPath = path.join(__dirname, '../../sunucular', binName);

        if (fs.existsSync(binPath)) {
            const stats = fs.statSync(binPath);
            if (stats.size > 1000000) { // Should be a few MBs at least
                return binPath;
            }
        }

        const binDir = path.dirname(binPath);
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        this._updateProgress('Installer İndiriliyor', 5, 'FTB Server Installer aracı indiriliyor...');

        try {
            // Using dynamic import of axios to avoid top-level require if not installed, though it's standard in many node projects.
            // If axios isn't installed, we can fall back to fetch or wait for user to install. We will use native fetch.
            const response = await fetch(url, { redirect: 'follow' });

            if (!response.ok) {
                throw new Error(`Failed to download FTB installer: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync(binPath, Buffer.from(arrayBuffer));

            if (platform !== 'win32') {
                fs.chmodSync(binPath, '755');
            }
            return binPath;
        } catch (err) {
            try { if (fs.existsSync(binPath)) fs.unlinkSync(binPath); } catch { /* ignore */ }
            throw new Error(`FTB indirme hatası: ${err.message}`);
        }
    }

    /**
     * FTB Modpack yükleme - Installer cli kullanarak
     */
    async installModpack(modId, fileId) {
        if (installStatus.isInstalling) {
            throw new Error('Zaten bir kurulum devam ediyor');
        }

        try {
            const db = getDb();
            const baseServerPath = process.env.MINECRAFT_SERVER_PATH || path.join(__dirname, '../../sunucular');

            // 1. Bilgi al
            this._updateProgress('Bilgi Alınıyor', 5, 'FTB Modpack bilgileri alınıyor...');
            const modDetails = await this.getModpackDetails(modId);
            const versions = modDetails.versions || [];
            const selectedFile = versions.find(v => v.id === fileId) || versions[versions.length - 1]; // Fallback to newest

            if (!selectedFile) throw new Error('Dosya/sürüm bulunamadı');

            // Profil klasör adı
            const slug = modDetails.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const profilePath = path.join(baseServerPath, slug);

            if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });

            // 2. Installer İndir
            const installerPath = await this._downloadInstaller(process.platform, modId, selectedFile.id);

            // 3. Kurulum İşlemini Başlat
            this._updateProgress('Kurulum', 15, 'FTB Modpack indiriliyor ve kuruluyor (Bu işlem uzun sürebilir)...');

            await new Promise((resolve, reject) => {
                // FTB Server Installer arguments
                console.log(`[FTB] Running installer: ${installerPath} ${selectedFile.id} --auto --path "${profilePath}"`);

                // Spawn with custom params
                const child = spawn(installerPath, [selectedFile.id.toString(), '--auto', '--path', profilePath], {
                    cwd: profilePath,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let lastProgress = 15;

                child.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(`[FTB Installer] ${output.trim()}`);

                    // Try to parse percentage if the installer outputs it
                    const match = output.match(/(\d+)%/);
                    if (match) {
                        const pct = parseInt(match[1]);
                        // Scale 0-100 to 15-90
                        const scaled = Math.floor(15 + (pct * 0.75));
                        if (scaled > lastProgress) {
                            lastProgress = scaled;
                            this._updateProgress('Kurulum', scaled, 'Modpack yükleniyor...');
                        }
                    } else if (output.includes('Downloading')) {
                        this._updateProgress('Kurulum', lastProgress, 'Dosyalar indiriliyor...');
                    }
                });

                child.stderr.on('data', (data) => {
                    console.warn(`[FTB Installer Warn] ${data.toString().trim()}`);
                });

                child.on('close', (code) => {
                    if (code === 0 || code === null) {
                        resolve();
                    } else {
                        reject(new Error(`FTB Kurulum aracı başarısız oldu (Çıkış kodu: ${code})`));
                    }
                });

                child.on('error', (err) => {
                    reject(new Error(`FTB Kurulum aracı başlatılamadı: ${err.message}`));
                });
            });

            // 4. CurseForge ile aynı "Düzenle ve Temizle" metodu
            this._updateProgress('Düzenleniyor', 90, 'Klasör yapısı düzenleniyor...');
            const curseforgeService = require('./curseforgeService');
            curseforgeService._normalizeExtractedFiles(profilePath);

            // 5. İlk kurulumsa aktif yap
            const existingActive = db.prepare('SELECT id FROM installed_modpacks WHERE is_active = 1').get();
            const isFirstInstall = !existingActive;

            // 6. Veritabanını güncelle
            this._updateProgress('Kayıt', 95, 'Veritabanı güncelleniyor...');
            const stmt = db.prepare(`
                INSERT INTO installed_modpacks (curseforge_id, name, version, author, logo_url, install_path, is_active, status, curseforge_file_id, file_display_name, provider) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'installed', ?, ?, ?)
            `);

            stmt.run(
                modId,
                modDetails.name,
                selectedFile.name,
                'Feed The Beast',
                `https://api.modpacks.ch/public/modpack/${modId}/art/logo`,
                profilePath,
                isFirstInstall ? 1 : 0,
                selectedFile.id,
                selectedFile.name,
                'ftb'
            );

            // 7. Tamamlandı
            installStatus = {
                isInstalling: false,
                progress: 100,
                task: 'Tamamlandı',
                status: `FTB Kurulum tamamlandı! (${slug}/)`,
                error: null,
            };

            return {
                name: modDetails.name,
                version: selectedFile.name,
                profilePath,
                slug,
            };
        } catch (error) {
            this._setError(error.message);
            throw error;
        }
    }
}

module.exports = new FtbService();
