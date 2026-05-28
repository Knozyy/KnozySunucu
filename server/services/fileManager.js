const fs = require('fs');
const path = require('path');

/**
 * Dosya Yöneticisi - Sunucu dosyalarını görüntüleme, düzenleme, yükleme, silme
 */
class FileManager {
    /**
     * @param {string} [basePath] - Sunucu kök dizini. Verilmezse env'den alır.
     */
    constructor(basePath) {
        this.basePath = basePath || process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
    }

    /**
     * Dizin içeriğini listele
     */
    list(relativePath = '') {
        const fullPath = this._resolve(relativePath);
        if (!fs.existsSync(fullPath)) return [];

        const items = fs.readdirSync(fullPath);
        return items.map(name => {
            const itemPath = path.join(fullPath, name);
            try {
                const stat = fs.statSync(itemPath);
                return {
                    name,
                    path: path.join(relativePath, name).replace(/\\/g, '/'),
                    isDirectory: stat.isDirectory(),
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                };
            } catch {
                return { name, path: path.join(relativePath, name).replace(/\\/g, '/'), isDirectory: false, size: 0, modified: null };
            }
        }).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Dosya içeriğini oku
     */
    read(relativePath) {
        const fullPath = this._resolve(relativePath);
        if (!fs.existsSync(fullPath)) throw new Error('Dosya bulunamadı');
        if (fs.statSync(fullPath).isDirectory()) throw new Error('Bu bir klasördür');

        const ext = path.extname(fullPath).toLowerCase();

        // Sadece okunamayacak KESİN binary uzantılarını engelle, .toml vb tekst tabanlıdır.
        const binaryExts = ['.jar', '.zip', '.gz', '.tar', '.png', '.jpg', '.jpeg', '.gif', '.dat', '.mca', '.nbt', '.sqlite', '.db'];
        if (binaryExts.includes(ext)) throw new Error('Binary dosya okunamaz');

        const maxSize = 1024 * 512; // 512KB limit
        const stat = fs.statSync(fullPath);
        if (stat.size > maxSize) throw new Error('Dosya çok büyük (max 512KB)');

        return fs.readFileSync(fullPath, 'utf-8');
    }

    /**
     * Dosya içeriğini yaz
     */
    write(relativePath, content) {
        const fullPath = this._resolve(relativePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
    }

    /**
     * Dosya/klasör oluştur
     */
    create(relativePath, isDirectory = false) {
        const fullPath = this._resolve(relativePath);
        if (fs.existsSync(fullPath)) throw new Error('Bu isimde bir dosya/klasör zaten var');
        if (isDirectory) {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, '', 'utf-8');
        }
    }

    /**
     * Dosya/klasör sil
     */
    remove(relativePath) {
        const fullPath = this._resolve(relativePath);
        if (!fs.existsSync(fullPath)) throw new Error('Dosya/klasör bulunamadı');

        // Kritik dosyaları koruma
        const protectedPaths = ['server.properties', 'eula.txt'];
        const baseName = path.basename(fullPath);
        if (protectedPaths.includes(baseName)) throw new Error('Bu dosya silinemez');

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
    }

    /**
     * Dosya/klasör yeniden adlandır
     */
    rename(oldPath, newName) {
        const fullOld = this._resolve(oldPath);
        if (!fs.existsSync(fullOld)) throw new Error('Dosya/klasör bulunamadı');
        const dir = path.dirname(fullOld);
        const fullNew = path.join(dir, newName);
        if (fs.existsSync(fullNew)) throw new Error('Bu isimde bir dosya/klasör zaten var');
        fs.renameSync(fullOld, fullNew);
    }

    _resolve(relativePath) {
        const base = path.resolve(this.basePath);
        const resolved = path.resolve(base, relativePath || '');
        // Path traversal koruması — ayraç duyarlı kontrol. Düz startsWith yetersiz:
        // base "/srv/server" iken "/srv/server-secret" de startsWith'i geçer ve
        // kardeş dizine kaçış mümkün olurdu. base'in kendisine veya base + ayraç
        // ile başlayan yollara izin ver.
        if (resolved !== base && !resolved.startsWith(base + path.sep)) {
            throw new Error('Geçersiz dizin yolu');
        }
        return resolved;
    }
}

module.exports = FileManager;
