const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');
const serverRegistry = require('../services/serverRegistry');

const router = express.Router();

function getBackupPath() {
    return process.env.BACKUP_PATH || '/home/minecraft/backups';
}

function instanceFor(req) {
    const sid = req.query.serverId || req.body?.serverId || null;
    if (sid) return serverRegistry.get(sid);
    return serverRegistry.getDefault();
}

// GET /api/backup/list?serverId=X — verilirse o sunucuya ait, yoksa tüm yedekler
router.get('/list', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const sid = req.query.serverId ? parseInt(req.query.serverId) : null;
        const backups = sid
            ? db.prepare('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC').all(sid)
            : db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
        res.json({ backups });
    } catch (error) {
        console.error('[Backup] List error:', error.message);
        res.status(500).json({ error: 'Yedekleme listesi alınamadı' });
    }
});

// POST /api/backup/create  body: { name, serverId? }
router.post('/create', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const inst = instanceFor(req);
        if (!inst) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        const serverId = inst._serverConfig.id;
        const serverDir = inst.getServerPath();
        const backupDir = getBackupPath();

        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Dosya adına serverId ekleyerek karışıklığı önle
        const backupName = req.body.name || `srv${serverId}-backup-${timestamp}`;
        const filename = `srv${serverId}-${backupName}.tar.gz`;
        const backupPath = path.join(backupDir, filename);

        const output = fs.createWriteStream(backupPath);
        const archive = archiver('tar', { gzip: true });

        output.on('close', () => {
            const db = getDb();
            const size = archive.pointer();
            db.prepare('INSERT INTO backups (name, filename, size, server_id) VALUES (?, ?, ?, ?)')
                .run(backupName, filename, size, serverId);

            res.json({ message: 'Yedekleme oluşturuldu', name: backupName, filename, size, serverId });
        });

        archive.on('error', (err) => {
            console.error('[Backup] Archive error:', err.message);
            res.status(500).json({ error: 'Yedekleme oluşturulamadı' });
        });

        archive.pipe(output);

        const worldDir = path.join(serverDir, 'world');
        if (fs.existsSync(worldDir)) archive.directory(worldDir, 'world');

        const configFiles = ['server.properties', 'ops.json', 'whitelist.json', 'banned-players.json'];
        for (const file of configFiles) {
            const fp = path.join(serverDir, file);
            if (fs.existsSync(fp)) archive.file(fp, { name: file });
        }

        const modsDir = path.join(serverDir, 'mods');
        if (fs.existsSync(modsDir)) archive.directory(modsDir, 'mods');

        archive.finalize();
    } catch (error) {
        console.error('[Backup] Create error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/backup/:id
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
        if (!backup) return res.status(404).json({ error: 'Yedek bulunamadı' });

        const backupPath = path.join(getBackupPath(), backup.filename);
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

        db.prepare('DELETE FROM backups WHERE id = ?').run(req.params.id);
        res.json({ message: 'Yedek silindi' });
    } catch (error) {
        console.error('[Backup] Delete error:', error.message);
        res.status(500).json({ error: 'Yedek silinemedi' });
    }
});

// POST /api/backup/restore/:id — yedek kaydındaki server_id'ye geri yükler
router.post('/restore/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
        if (!backup) return res.status(404).json({ error: 'Yedek bulunamadı' });

        const backupPath = path.join(getBackupPath(), backup.filename);
        if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Yedek dosyası bulunamadı' });

        // Hangi sunucuya yüklenecek? Önce backup'taki server_id, yoksa body.serverId, yoksa default
        let inst = null;
        if (backup.server_id) inst = serverRegistry.get(backup.server_id);
        if (!inst) inst = instanceFor(req);
        if (!inst) return res.status(404).json({ error: 'Hedef sunucu bulunamadı' });

        const serverDir = inst.getServerPath();
        const { execSync } = require('child_process');
        execSync(`tar -xzf "${backupPath}" -C "${serverDir}"`, { stdio: 'pipe' });

        res.json({
            message: `Yedek "${inst._serverConfig.name}" sunucusuna geri yüklendi. Sunucuyu yeniden başlatmanız gerekebilir.`,
            serverId: inst._serverConfig.id,
        });
    } catch (error) {
        console.error('[Backup] Restore error:', error.message);
        res.status(500).json({ error: 'Geri yükleme başarısız' });
    }
});

module.exports = router;
