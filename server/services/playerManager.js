const fs = require('fs');
const path = require('path');

/**
 * Oyuncu Yöneticisi - Whitelist, ops, ban yönetimi
 */
class PlayerManager {
    constructor() {
        this.serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    _readJsonFile(fileName) {
        const filePath = path.join(this.serverPath, fileName);
        if (!fs.existsSync(filePath)) return [];
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch { return []; }
    }

    _writeJsonFile(fileName, data) {
        const filePath = path.join(this.serverPath, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    // Whitelist
    getWhitelist() { return this._readJsonFile('whitelist.json'); }

    addToWhitelist(name, uuid = '') {
        const list = this.getWhitelist();
        if (list.find(p => p.name.toLowerCase() === name.toLowerCase())) {
            throw new Error('Oyuncu zaten whitelist\'te');
        }
        list.push({ uuid: uuid || '00000000-0000-0000-0000-000000000000', name });
        this._writeJsonFile('whitelist.json', list);
    }

    removeFromWhitelist(name) {
        let list = this.getWhitelist();
        list = list.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        this._writeJsonFile('whitelist.json', list);
    }

    // Ops
    getOps() { return this._readJsonFile('ops.json'); }

    addOp(name, uuid = '', level = 4) {
        const list = this.getOps();
        if (list.find(p => p.name.toLowerCase() === name.toLowerCase())) {
            throw new Error('Oyuncu zaten op');
        }
        list.push({
            uuid: uuid || '00000000-0000-0000-0000-000000000000',
            name, level, bypassesPlayerLimit: false,
        });
        this._writeJsonFile('ops.json', list);
    }

    removeOp(name) {
        let list = this.getOps();
        list = list.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        this._writeJsonFile('ops.json', list);
    }

    // Ban
    getBannedPlayers() { return this._readJsonFile('banned-players.json'); }

    banPlayer(name, reason = 'Panel üzerinden banlandı') {
        const list = this.getBannedPlayers();
        if (list.find(p => p.name.toLowerCase() === name.toLowerCase())) {
            throw new Error('Oyuncu zaten banlı');
        }
        list.push({
            uuid: '00000000-0000-0000-0000-000000000000',
            name, created: new Date().toISOString(),
            source: 'Panel', expires: 'forever', reason,
        });
        this._writeJsonFile('banned-players.json', list);
    }

    unbanPlayer(name) {
        let list = this.getBannedPlayers();
        list = list.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        this._writeJsonFile('banned-players.json', list);
    }

    // Banned IPs
    getBannedIps() { return this._readJsonFile('banned-ips.json'); }

    banIp(ip, reason = 'Panel üzerinden banlandı') {
        const list = this.getBannedIps();
        if (list.find(e => e.ip === ip)) throw new Error('IP zaten banlı');
        list.push({ ip, created: new Date().toISOString(), source: 'Panel', expires: 'forever', reason });
        this._writeJsonFile('banned-ips.json', list);
    }

    unbanIp(ip) {
        let list = this.getBannedIps();
        list = list.filter(e => e.ip !== ip);
        this._writeJsonFile('banned-ips.json', list);
    }
}

module.exports = PlayerManager;
