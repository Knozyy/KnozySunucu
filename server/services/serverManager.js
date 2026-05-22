/**
 * serverManager — DEPRECATED ALIAS
 *
 * Eski "birincil singleton + ikincil instance" mimarisinin yerini
 * serverRegistry (eşit sunucu mimarisi) aldı. Bu dosya geriye dönük
 * uyumluluk için var; yeni kod doğrudan serverRegistry'yi require etmeli.
 */
const serverRegistry = require('./serverRegistry');

// Eski API uyumluluğu:
//   serverManager.setPrimary(instance) → artık no-op (registry initialize'da kurar)
//   serverManager.getInstance(id)      → registry.get(id)
//   serverManager.getPrimary()         → registry.getDefault()
//   serverManager._instances           → registry._instances
//   serverManager.getAllStatus()       → registry.getAllStatus()
//   serverManager.getRunningCount()    → registry.getRunningCount()
const serverManager = {
    setPrimary() { /* no-op — registry kendi kendini yönetiyor */ },
    getInstance: (id) => serverRegistry.get(id),
    getPrimary: () => serverRegistry.getDefault(),
    getAllStatus: () => serverRegistry.getAllStatus(),
    getRunningCount: () => serverRegistry.getRunningCount(),
    get _instances() { return serverRegistry._instances; },
};

module.exports = { serverManager, serverRegistry };
