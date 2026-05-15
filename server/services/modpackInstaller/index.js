const { getDb } = require('../../db/database');
const detector = require('./detector');
const validator = require('./validator');
const repairer = require('./repairer');
const verifier = require('./verifier');

/**
 * Modpack Installer Orkestratörü
 * Phase 2-9: Tespit → Doğrulama → Onarım → Doğrulama → Rapor
 */
class ModpackInstaller {
    /**
     * Phase 2-4: Analiz — tespit + doğrulama raporu döndür
     * @param {number} dbId
     * @returns {{ modpackId, modpackName, installPath, detectedInfo, issues, readyToLaunch }}
     */
    analyze(dbId) {
        const modpack = this._getModpack(dbId);
        const installPath = modpack.install_path;

        const detectedInfo = detector.detect(installPath);
        const issues = validator.validate(installPath, detectedInfo);

        return {
            modpackId: dbId,
            modpackName: modpack.name,
            installPath,
            detectedInfo,
            issues,
            readyToLaunch: issues.filter(i => i.severity === 'error').length === 0,
        };
    }

    /**
     * Phase 5-7: Onarım başlat (async, polling ile takip)
     * @param {number} dbId
     * @param {string[]} selectedIssueIds - Kullanıcının onayladığı sorun ID'leri
     * @param {object} analysisResult - analyze() çıktısı
     * @param {object} opts - { maxRam, minRam }
     * @returns {{ repairId: string }}
     */
    startRepair(dbId, selectedIssueIds, analysisResult, opts = {}) {
        const modpack = this._getModpack(dbId);
        const { installPath, detectedInfo, issues } = analysisResult;

        const repairOpts = {
            maxRam: modpack.max_ram || opts.maxRam || '4G',
            minRam: modpack.min_ram || opts.minRam || '2G',
        };

        const repairId = repairer.startRepair(installPath, issues, selectedIssueIds, detectedInfo, repairOpts);
        return { repairId };
    }

    /**
     * Onarım durumunu sorgula (polling için)
     * @param {string} repairId
     * @returns {{ progress, log, done, error } | null}
     */
    getRepairStatus(repairId) {
        return repairer.getStatus(repairId);
    }

    /**
     * Phase 8: Onarım sonrası final doğrulama
     * @param {number} dbId
     * @returns {{ ready, issues, summary, detectedInfo }}
     */
    verify(dbId) {
        const modpack = this._getModpack(dbId);
        const detectedInfo = detector.detect(modpack.install_path);
        const result = verifier.verify(modpack.install_path, detectedInfo);
        return { ...result, detectedInfo };
    }

    _getModpack(dbId) {
        const db = getDb();
        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(dbId);
        if (!modpack) throw new Error(`Modpack bulunamadı (id: ${dbId})`);
        return modpack;
    }
}

module.exports = new ModpackInstaller();
