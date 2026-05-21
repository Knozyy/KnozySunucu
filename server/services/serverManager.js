/**
 * ServerManager — Çoklu Minecraft sunucu instance yönetimi
 * Her sunucu DB'deki `servers` tablosuna karşılık gelir.
 * Birincil sunucu (id=1 veya ilk aktif) mevcut minecraftService singletonıdır.
 */
const { getDb } = require('../db/database');

class ServerManager {
    constructor() {
        this._instances = new Map(); // serverId → MinecraftService instance
    }

    /**
     * Birincil sunucu instance'ını kaydet (mevcut minecraftService singleton)
     */
    setPrimary(instance) {
        // DB'deki ilk sunucunun id'sini bul
        try {
            const db = getDb();
            const first = db.prepare('SELECT id FROM servers ORDER BY id ASC LIMIT 1').get();
            if (first) {
                this._instances.set(first.id, instance);
                instance._serverConfig = instance._serverConfig || { id: first.id, isPrimary: true };
            }
        } catch { /* ignore */ }
        this._primary = instance;
    }

    /**
     * Belirli bir sunucu ID'si için instance döndür.
     * Yoksa yeni bir tane oluştur.
     */
    getInstance(serverId) {
        if (this._instances.has(serverId)) return this._instances.get(serverId);

        // DB'den sunucu config al
        const db = getDb();
        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
        if (!server) return null;

        const { MinecraftService } = require('./minecraftService');
        const instance = new MinecraftService({ ...server, isPrimary: false });
        this._instances.set(serverId, instance);
        return instance;
    }

    /**
     * Birincil sunucu instance'ını döndür
     */
    getPrimary() {
        return this._primary || null;
    }

    /**
     * Tüm sunucuların durumunu döndür
     */
    getAllStatus() {
        const db = getDb();
        const servers = db.prepare('SELECT * FROM servers ORDER BY id ASC').all();
        return servers.map(server => {
            const instance = this._instances.get(server.id);
            const status = instance ? instance.getStatus() : { status: 'stopped', players: [], playerCount: 0, processStats: { cpuPercent: 0, memoryMB: 0 } };
            return {
                ...server,
                ...status,
            };
        });
    }

    /**
     * Şu an çalışan sunucu sayısı (CPU bölme için)
     */
    getRunningCount() {
        let count = 0;
        for (const instance of this._instances.values()) {
            if (instance.status === 'running' || instance.status === 'starting') count++;
        }
        return count;
    }
}

const serverManager = new ServerManager();
module.exports = { serverManager, ServerManager };
