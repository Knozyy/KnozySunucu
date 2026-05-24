/**
 * ServerRegistry — Çoklu Minecraft sunucu yönetimi (eşit mimari)
 *
 * "Birincil/ikincil" ayrımı YOK. Her sunucu DB'deki `servers` tablosunda bir
 * kayda karşılık gelir ve `knozy-mc{id}` adlı screen oturumunu kullanır.
 *
 * - registry.get(id)        → ServerProcess (lazy oluşturur)
 * - registry.getDefault()   → İlk sunucu (legacy / tek-sunuculu route'lar için)
 * - registry.initialize()   → Panel açılışında tüm DB sunucularını canlandır
 * - registry.getAllStatus() → Tüm sunucuların durumu
 */
const { getDb } = require('../db/database');

class ServerRegistry {
    constructor() {
        this._instances = new Map(); // id → MinecraftService
        this._initialized = false;
    }

    /**
     * Panel açılışında çağrılır — DB'deki her sunucu için instance oluştur.
     * Bu, panel yeniden başlasa bile çalışan screen oturumlarını yakalayacaktır.
     */
    initialize() {
        if (this._initialized) return;
        this._initialized = true;
        try {
            const db = getDb();
            const servers = db.prepare('SELECT * FROM servers ORDER BY id ASC').all();
            for (const srv of servers) this._create(srv);

            // SIGTERM/SIGINT — tüm sunucuları temiz kapat
            const gracefulShutdown = () => {
                for (const inst of this._instances.values()) {
                    try {
                        inst._shuttingDown = true;
                        inst._stopStatusWatch?.();
                        inst._stopStatsTracking?.();
                        inst._stopLogTail?.();
                    } catch { /* ignore */ }
                }
                process.exit(0);
            };
            process.once('SIGTERM', gracefulShutdown);
            process.once('SIGINT',  gracefulShutdown);

            // Player History Recorder (her 30 saniyede bir)
            setInterval(() => {
                try {
                    const discordBotService = require('./discordBotService');
                    // Çalışan tüm sunucuların oyuncu sayılarını topla
                    let totalPlayers = 0;
                    const statuses = this.getAllStatus();
                    for (const s of statuses) {
                        if (s.status === 'running') {
                            totalPlayers += (s.playerCount || 0);
                        }
                    }
                    discordBotService.addPlayerHistoryRecord(totalPlayers);
                } catch { /* ignore */ }
            }, 30000);

        } catch (err) {
            console.error('[ServerRegistry] init hatası:', err.message);
        }
    }

    _create(serverRecord) {
        if (this._instances.has(serverRecord.id)) return this._instances.get(serverRecord.id);
        const { MinecraftService } = require('./minecraftService');
        const inst = new MinecraftService(serverRecord);
        this._instances.set(serverRecord.id, inst);
        return inst;
    }

    /**
     * ID'ye göre instance döndür — yoksa DB'den oluşturur.
     */
    get(id) {
        const numId = typeof id === 'number' ? id : parseInt(id);
        if (!numId) return null;
        if (this._instances.has(numId)) return this._instances.get(numId);
        try {
            const db = getDb();
            const srv = db.prepare('SELECT * FROM servers WHERE id = ?').get(numId);
            if (!srv) return null;
            return this._create(srv);
        } catch { return null; }
    }

    /**
     * Default sunucu — DB'deki en küçük id'li sunucu.
     * Tek-sunuculu çağrıları desteklemek için (legacy route'lar).
     */
    getDefault() {
        try {
            const db = getDb();
            const first = db.prepare('SELECT id FROM servers ORDER BY id ASC LIMIT 1').get();
            if (!first) return null;
            return this.get(first.id);
        } catch { return null; }
    }

    /**
     * Default sunucunun id'si — Proxy ve route'lar için.
     */
    getDefaultId() {
        try {
            const db = getDb();
            const first = db.prepare('SELECT id FROM servers ORDER BY id ASC LIMIT 1').get();
            return first?.id || null;
        } catch { return null; }
    }

    /**
     * Tüm DB sunucularının durumunu döndür (her sunucu için ayrı satır).
     */
    getAllStatus() {
        const db = getDb();
        const servers = db.prepare('SELECT * FROM servers ORDER BY id ASC').all();
        return servers.map(server => {
            const inst = this._instances.get(server.id) || this._create(server);
            const status = inst ? inst.getStatus() : {
                status: 'stopped', players: [], playerCount: 0,
                processStats: { cpuPercent: 0, memoryMB: 0 },
            };
            let activeModpack = null;
            if (server.active_modpack_id) {
                try {
                    activeModpack = db.prepare(
                        'SELECT id, name, version, logo_url FROM installed_modpacks WHERE id = ?'
                    ).get(server.active_modpack_id) || null;
                } catch { /* ignore */ }
            }
            return { ...server, ...status, activeModpack };
        });
    }

    /**
     * Şu anda çalışan/başlayan sunucu sayısı (CPU bölme için)
     */
    getRunningCount() {
        let count = 0;
        for (const inst of this._instances.values()) {
            if (inst.status === 'running' || inst.status === 'starting') count++;
        }
        return count;
    }

    /**
     * Sunucu kaydı silindiğinde instance'ı temizle
     */
    remove(id) {
        const inst = this._instances.get(id);
        if (!inst) return;
        try {
            inst._shuttingDown = true;
            inst._stopStatusWatch?.();
            inst._stopStatsTracking?.();
            inst._stopLogTail?.();
        } catch { /* ignore */ }
        this._instances.delete(id);
    }
}

const serverRegistry = new ServerRegistry();
module.exports = serverRegistry;
module.exports.serverRegistry = serverRegistry;
