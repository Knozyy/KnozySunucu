const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const CURSEFORGE_API_BASE = 'https://api.curseforge.com';
const MINECRAFT_GAME_ID = 432;
const MODPACK_CLASS_ID = 4471;

class CurseForgeService {
    getApiKey() {
        return process.env.CURSEFORGE_API_KEY || '';
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
                        const parsed = JSON.parse(data);
                        resolve(parsed);
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
        return (result.data || []).map(mod => ({
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
            })),
        }));
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
        return (result.data || []).map(mod => ({
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
            })),
        }));
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
        }));
    }

    downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error('İndirme URL\'si bulunamadı'));
                return;
            }

            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const file = fs.createWriteStream(destPath);
            const protocol = url.startsWith('https') ? https : http;

            protocol.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Follow redirect
                    this.downloadFile(response.headers.location, destPath)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
            }).on('error', (err) => {
                fs.unlink(destPath, () => { });
                reject(err);
            });
        });
    }

    async installModpack(modId, fileId) {
        const db = getDb();
        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';

        // Get mod details
        const modDetails = await this.getModpackDetails(modId);
        const files = await this.getModpackFiles(modId);
        const selectedFile = files.find(f => f.id === fileId) || files[0];

        if (!selectedFile) {
            throw new Error('Dosya bulunamadı');
        }

        if (!selectedFile.downloadUrl) {
            throw new Error('Bu modpack\'in indirme URL\'si mevcut değil. CurseForge üzerinden manuel indirmeniz gerekebilir.');
        }

        const modsDir = path.join(serverPath, 'mods');
        if (!fs.existsSync(modsDir)) {
            fs.mkdirSync(modsDir, { recursive: true });
        }

        // Download the modpack file
        const destPath = path.join(modsDir, selectedFile.fileName);
        await this.downloadFile(selectedFile.downloadUrl, destPath);

        // Save to database
        const stmt = db.prepare(`
      INSERT INTO installed_modpacks (curseforge_id, name, version, author, logo_url, status) 
      VALUES (?, ?, ?, ?, ?, 'installed')
    `);

        stmt.run(
            modId,
            modDetails.name,
            selectedFile.displayName,
            modDetails.authors?.[0]?.name || 'Bilinmiyor',
            modDetails.logo?.url || null
        );

        return {
            name: modDetails.name,
            version: selectedFile.displayName,
            fileName: selectedFile.fileName,
        };
    }

    async uninstallModpack(dbId) {
        const db = getDb();
        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(dbId);

        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }

        // Remove from database
        db.prepare('DELETE FROM installed_modpacks WHERE id = ?').run(dbId);

        return { message: `${modpack.name} kaldırıldı` };
    }

    getInstalledModpacks() {
        const db = getDb();
        return db.prepare('SELECT * FROM installed_modpacks ORDER BY installed_at DESC').all();
    }
}

module.exports = new CurseForgeService();
