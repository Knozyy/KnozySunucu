const fs = require('fs');
const path = require('path');

/**
 * Mod Yöneticisi - mods klasöründeki modları yönet
 */
class ModManager {
    constructor() {
        this.serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    get modsDir() {
        return path.join(this.serverPath, 'mods');
    }

    get disabledDir() {
        return path.join(this.serverPath, 'mods_disabled');
    }

    /**
     * Aktif modları listele
     */
    listActive() {
        if (!fs.existsSync(this.modsDir)) return [];
        return fs.readdirSync(this.modsDir)
            .filter(f => f.endsWith('.jar'))
            .map(name => {
                const filePath = path.join(this.modsDir, name);
                const stat = fs.statSync(filePath);
                return {
                    name, enabled: true,
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Devre dışı modları listele
     */
    listDisabled() {
        if (!fs.existsSync(this.disabledDir)) return [];
        return fs.readdirSync(this.disabledDir)
            .filter(f => f.endsWith('.jar'))
            .map(name => {
                const filePath = path.join(this.disabledDir, name);
                const stat = fs.statSync(filePath);
                return {
                    name, enabled: false,
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Tüm modları listele
     */
    listAll() {
        return [...this.listActive(), ...this.listDisabled()];
    }

    /**
     * Modu devre dışı bırak
     */
    disable(modName) {
        const src = path.join(this.modsDir, modName);
        if (!fs.existsSync(src)) throw new Error('Mod bulunamadı');
        if (!fs.existsSync(this.disabledDir)) fs.mkdirSync(this.disabledDir, { recursive: true });
        fs.renameSync(src, path.join(this.disabledDir, modName));
    }

    /**
     * Modu aktif et
     */
    enable(modName) {
        const src = path.join(this.disabledDir, modName);
        if (!fs.existsSync(src)) throw new Error('Mod bulunamadı');
        fs.renameSync(src, path.join(this.modsDir, modName));
    }

    /**
     * Modu sil
     */
    remove(modName) {
        const activePath = path.join(this.modsDir, modName);
        const disabledPath = path.join(this.disabledDir, modName);

        if (fs.existsSync(activePath)) { fs.unlinkSync(activePath); return; }
        if (fs.existsSync(disabledPath)) { fs.unlinkSync(disabledPath); return; }
        throw new Error('Mod bulunamadı');
    }

    /**
     * Mod sayısı
     */
    count() {
        const active = this.listActive().length;
        const disabled = this.listDisabled().length;
        return { active, disabled, total: active + disabled };
    }
}

module.exports = ModManager;
