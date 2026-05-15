const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const scriptGenerator = require('./scriptGenerator');

/**
 * Phase 5-7: Kullanıcı onayıyla sorun onarımı + Java yönetimi + script üretimi
 */
class Repairer {
    constructor() {
        this._statuses = {};
    }

    /**
     * Seçilen sorunları onar (async, polling ile takip)
     * @returns {string} repairId
     */
    startRepair(installPath, issues, selectedIssueIds, detectedInfo, opts = {}) {
        const repairId = randomUUID();
        this._statuses[repairId] = { progress: 0, log: [], done: false, error: null };

        const selected = issues.filter(i => selectedIssueIds.includes(i.id));
        this._run(repairId, installPath, selected, detectedInfo, opts).catch(() => {});

        return repairId;
    }

    getStatus(repairId) {
        return this._statuses[repairId] || null;
    }

    clearStatus(repairId) {
        delete this._statuses[repairId];
    }

    async _run(repairId, installPath, issues, detectedInfo, opts) {
        const total = issues.length;
        const log = (msg) => {
            this._statuses[repairId].log.push(msg);
        };

        try {
            for (let i = 0; i < issues.length; i++) {
                const issue = issues[i];
                log(`[${i + 1}/${total}] ${issue.title}`);
                await this._fixIssue(issue, installPath, detectedInfo, opts, log);
                this._statuses[repairId].progress = Math.floor(((i + 1) / total) * 100);
            }
            this._statuses[repairId].done = true;
            this._statuses[repairId].progress = 100;
            log('Tüm onarımlar tamamlandı.');
        } catch (err) {
            this._statuses[repairId].error = err.message;
            this._statuses[repairId].done = true;
            log(`Hata: ${err.message}`);
        }
    }

    async _fixIssue(issue, installPath, detectedInfo, opts, log) {
        switch (issue.id) {
            case 'missing_eula':
            case 'eula_not_accepted':
                this._fixEula(installPath, log);
                break;

            case 'missing_start_script':
                this._generateStartScripts(installPath, detectedInfo, opts, log);
                break;

            case 'installer_not_run':
                await this._runForgeInstaller(installPath, issue.meta?.installerJar, detectedInfo, log);
                break;

            case 'missing_jvm_args':
                this._generateJvmArgs(installPath, opts, log);
                break;

            case 'java_missing':
                await this._installJava(issue.meta?.requiredVersion, log);
                break;

            case 'missing_mods_dir':
                fs.mkdirSync(path.join(installPath, 'mods'), { recursive: true });
                log('mods/ klasörü oluşturuldu');
                break;

            default:
                if (issue.id.startsWith('crlf_')) {
                    this._fixCrlf(installPath, issue.meta?.scriptName, log);
                } else if (issue.id.startsWith('not_executable_')) {
                    this._fixExecutable(installPath, issue.meta?.scriptName, log);
                } else {
                    log(`Bilinmeyen sorun tipi: ${issue.id}, atlanıyor`);
                }
        }
    }

    _fixEula(installPath, log) {
        const content = `# Knozy Sunucu Paneli tarafindan otomatik olusturuldu
# https://aka.ms/MinecraftEULA
eula=true
`;
        fs.writeFileSync(path.join(installPath, 'eula.txt'), content, 'utf8');
        log('eula.txt oluşturuldu (eula=true)');
    }

    _generateStartScripts(installPath, detectedInfo, opts, log) {
        const maxRam = opts.maxRam || '4G';
        const minRam = opts.minRam || '2G';
        const jarName = this._findMainJar(installPath);
        const scriptOpts = { maxRam, minRam, jarName };

        const shContent = scriptGenerator.generateStartSh(detectedInfo.loader, detectedInfo.startupMode, scriptOpts);
        const batContent = scriptGenerator.generateStartBat(detectedInfo.loader, detectedInfo.startupMode, scriptOpts);

        const shPath = path.join(installPath, 'start.sh');
        const batPath = path.join(installPath, 'start.bat');

        fs.writeFileSync(shPath, shContent, { encoding: 'utf8' });
        fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });

        if (process.platform !== 'win32') {
            try { fs.chmodSync(shPath, 0o755); } catch { /* ignore */ }
        }

        log(`start.sh ve start.bat oluşturuldu (${detectedInfo.loader} / ${detectedInfo.startupMode} mod)`);
    }

    async _runForgeInstaller(installPath, installerJar, detectedInfo, log) {
        if (!installerJar) throw new Error('Installer JAR belirtilmedi');

        const JavaManager = require('../javaManager');
        const jm = new JavaManager();
        const javaPath = jm.getJavaPath(detectedInfo.requiredJava || 17) || 'java';
        const installerPath = path.join(installPath, installerJar);

        log(`Forge installer başlatılıyor: ${installerJar}`);
        execSync(`"${javaPath}" -jar "${installerPath}" --installServer "${installPath}"`, {
            cwd: installPath,
            timeout: 300000,
        });

        try { fs.unlinkSync(installerPath); } catch { /* ignore */ }
        log('Forge installer tamamlandı');
    }

    _generateJvmArgs(installPath, opts, log) {
        const maxRam = opts.maxRam || '4G';
        const minRam = opts.minRam || '2G';
        const content = scriptGenerator.generateUserJvmArgs(maxRam, minRam);
        fs.writeFileSync(path.join(installPath, 'user_jvm_args.txt'), content, 'utf8');
        log(`user_jvm_args.txt oluşturuldu (-Xmx${maxRam} -Xms${minRam})`);
    }

    async _installJava(version, log) {
        if (!version) throw new Error('Java versiyonu belirtilmedi');
        const JavaManager = require('../javaManager');
        const jm = new JavaManager();
        log(`Java ${version} Adoptium'dan indiriliyor...`);
        await jm.install(version, (pct, status) => {
            log(`Java ${version}: %${pct} - ${status}`);
        });
        log(`Java ${version} kurulumu tamamlandı`);
    }

    _fixCrlf(installPath, scriptName, log) {
        if (!scriptName) return;
        const filePath = path.join(installPath, scriptName);
        try {
            const original = fs.readFileSync(filePath);
            const fixed = original.toString().replace(/\r\n/g, '\n');
            fs.writeFileSync(filePath, fixed, 'utf8');
            log(`${scriptName}: CRLF → LF dönüştürüldü`);
        } catch (err) {
            log(`${scriptName}: CRLF düzeltme hatası: ${err.message}`);
        }
    }

    _fixExecutable(installPath, scriptName, log) {
        if (!scriptName || process.platform === 'win32') return;
        try {
            fs.chmodSync(path.join(installPath, scriptName), 0o755);
            log(`${scriptName}: chmod +x verildi`);
        } catch (err) {
            log(`${scriptName}: chmod hatası: ${err.message}`);
        }
    }

    _findMainJar(installPath) {
        try {
            const files = fs.readdirSync(installPath);
            for (const file of files) {
                if (!file.endsWith('.jar') || file.toLowerCase().includes('installer')) continue;
                const lower = file.toLowerCase();
                if (lower.includes('neoforge') || lower.includes('forge')) return file;
            }
            if (files.includes('server.jar')) return 'server.jar';
            const jars = files.filter(f => f.endsWith('.jar') && !f.toLowerCase().includes('installer'));
            return jars[0] || 'server.jar';
        } catch { return 'server.jar'; }
    }
}

module.exports = new Repairer();
