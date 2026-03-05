const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');

const router = express.Router();

function getBackupPath() {
    return process.env.BACKUP_PATH || '/home/minecraft/backups';
}

function getServerPath() {
    return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
}

// GET /api/backup/list
router.get('/list', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
        res.json({ backups });
    } catch (error) {
        console.error('[Backup] List error:', error.message);
        res.status(500).json({ error: 'Yedekleme listesi alınamadı' });
    }
});

// POST /api/backup/create
router.post('/create', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const backupDir = getBackupPath();
        const serverDir = getServerPath();

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = req.body.name || `backup-${timestamp}`;
        const filename = `${backupName}.tar.gz`;
        const backupPath = path.join(backupDir, filename);

        const output = fs.createWriteStream(backupPath);
        const archive = archiver('tar', { gzip: true });

        output.on('close', () => {
            const db = getDb();
            const size = archive.pointer();
            db.prepare('INSERT INTO backups (name, filename, size) VALUES (?, ?, ?)')
                .run(backupName, filename, size);

            res.json({
                message: 'Yedekleme oluşturuldu',
                name: backupName,
                filename,
                size,
            });
        });

        archive.on('error', (err) => {
            console.error('[Backup] Archive error:', err.message);
            res.status(500).json({ error: 'Yedekleme oluşturulamadı' });
        });

        archive.pipe(output);

        // Backup the world folder and key config files
        const worldDir = path.join(serverDir, 'world');
        if (fs.existsSync(worldDir)) {
            archive.directory(worldDir, 'world');
        }

        const configFiles = ['server.properties', 'ops.json', 'whitelist.json', 'banned-players.json'];
        configFiles.forEach(file => {
            const filePath = path.join(serverDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        });

        const modsDir = path.join(serverDir, 'mods');
        if (fs.existsSync(modsDir)) {
            archive.directory(modsDir, 'mods');
        }

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

        if (!backup) {
            return res.status(404).json({ error: 'Yedek bulunamadı' });
        }

        const backupPath = path.join(getBackupPath(), backup.filename);
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }

        db.prepare('DELETE FROM backups WHERE id = ?').run(req.params.id);
        res.json({ message: 'Yedek silindi' });
    } catch (error) {
        console.error('[Backup] Delete error:', error.message);
        res.status(500).json({ error: 'Yedek silinemedi' });
    }
});

// POST /api/backup/restore/:id
router.post('/restore/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);

        if (!backup) {
            return res.status(404).json({ error: 'Yedek bulunamadı' });
        }

        const backupPath = path.join(getBackupPath(), backup.filename);
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Yedek dosyası bulunamadı' });
        }

        // Extract backup using tar
        const { execSync } = require('child_process');
        const serverDir = getServerPath();
        execSync(`tar -xzf "${backupPath}" -C "${serverDir}"`, { stdio: 'pipe' });

        res.json({ message: 'Yedek geri yüklendi. Sunucuyu yeniden başlatmanız gerekebilir.' });
    } catch (error) {
        console.error('[Backup] Restore error:', error.message);
        res.status(500).json({ error: 'Geri yükleme başarısız' });
    }
});

module.exports = router;
