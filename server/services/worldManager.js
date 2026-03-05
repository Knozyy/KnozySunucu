const fs = require('fs');
const path = require('path');

/**
 * Dünya Yöneticisi - Dünya boyutu, sıfırlama, yönetim
 */
class WorldManager {
    constructor() {
        this.serverPath = require('./minecraftService').getServerPath();
    }

    /**
     * Dünyaları listele
     */
    list() {
        const worldDirs = ['world', 'world_nether', 'world_the_end'];
        const worlds = [];

        for (const dir of worldDirs) {
            const worldPath = path.join(this.serverPath, dir);
            if (fs.existsSync(worldPath) && fs.statSync(worldPath).isDirectory()) {
                const size = this._getDirSize(worldPath);
                worlds.push({
                    name: dir,
                    path: dir,
                    size,
                    sizeFormatted: this._formatSize(size),
                    exists: true,
                });
            }
        }

        // Ek dünya klasörlerini de kontrol et
        try {
            const items = fs.readdirSync(this.serverPath);
            for (const item of items) {
                if (worldDirs.includes(item)) continue;
                const itemPath = path.join(this.serverPath, item);
                if (!fs.statSync(itemPath).isDirectory()) continue;

                // level.dat varsa dünya klasörüdür
                if (fs.existsSync(path.join(itemPath, 'level.dat'))) {
                    const size = this._getDirSize(itemPath);
                    worlds.push({
                        name: item, path: item, size,
                        sizeFormatted: this._formatSize(size), exists: true,
                    });
                }
            }
        } catch { /* ignore */ }

        return worlds;
    }

    /**
     * Dünyayı sıfırla (sil)
     */
    reset(worldName) {
        const worldPath = path.join(this.serverPath, worldName);
        if (!fs.existsSync(worldPath)) throw new Error('Dünya bulunamadı');

        // level.dat var mı kontrol (gerçekten dünya mı)
        if (!fs.existsSync(path.join(worldPath, 'level.dat'))) {
            throw new Error('Bu bir Minecraft dünyası değil');
        }

        fs.rmSync(worldPath, { recursive: true, force: true });
        return { message: `${worldName} silindi. Sunucu başlatılınca yeni dünya oluşacak.` };
    }

    /**
     * Dünya yedeği al
     */
    backup(worldName) {
        const worldPath = path.join(this.serverPath, worldName);
        if (!fs.existsSync(worldPath)) throw new Error('Dünya bulunamadı');

        const backupsDir = path.join(this.serverPath, '..', 'backups', 'worlds');
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${worldName}_${timestamp}`;
        const backupPath = path.join(backupsDir, backupName);

        fs.cpSync(worldPath, backupPath, { recursive: true });
        return { message: `${worldName} yedeklendi: ${backupName}`, backupName };
    }

    /**
     * Toplam dünya boyutu
     */
    totalSize() {
        const worlds = this.list();
        const total = worlds.reduce((sum, w) => sum + w.size, 0);
        return { totalBytes: total, formatted: this._formatSize(total), worldCount: worlds.length };
    }

    _getDirSize(dirPath) {
        let size = 0;
        try {
            const items = fs.readdirSync(dirPath);
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                try {
                    const stat = fs.lstatSync(itemPath);
                    if (stat.isSymbolicLink()) continue;
                    if (stat.isDirectory()) {
                        size += this._getDirSize(itemPath);
                    } else {
                        size += stat.size;
                    }
                } catch { /* erişilemeyen dosya, atla */ }
            }
        } catch { /* ignore */ }
        return size;
    }

    _formatSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        if (i < 0 || i >= units.length) return '0 B';
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }
}

module.exports = WorldManager;
