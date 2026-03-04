const si = require('systeminformation');
const path = require('path');
const fs = require('fs');

/**
 * RAM Optimizer - Mod sayısına göre RAM önerisi ve JVM args üretimi
 */
class RAMOptimizer {
    /**
     * Sistem RAM bilgilerini getir
     */
    static async getSystemRAM() {
        const mem = await si.mem();
        return {
            totalGB: +(mem.total / (1024 ** 3)).toFixed(2),
            availableGB: +(mem.available / (1024 ** 3)).toFixed(2),
            usedGB: +(mem.used / (1024 ** 3)).toFixed(2),
            totalMB: Math.floor(mem.total / (1024 ** 2)),
            availableMB: Math.floor(mem.available / (1024 ** 2)),
        };
    }

    /**
     * Mod sayısına göre optimal RAM hesapla
     */
    static calculateOptimalRAM(modCount = 0, systemRAMGB = 16) {
        // Baz RAM
        let baseGB = 2.0;

        // Mod etkisi
        let modImpact = 0;
        if (modCount > 300) modImpact = 7.0;
        else if (modCount > 150) modImpact = 5.0;
        else if (modCount > 100) modImpact = 3.0;
        else if (modCount > 50) modImpact = 2.0;
        else if (modCount > 0) modImpact = 1.0;

        const totalNeeded = baseGB + modImpact;

        // Sistem sınırları (OS için 2GB bırak)
        const maxAllocatable = Math.max(2, systemRAMGB - 2);
        const maxRAMGB = Math.min(totalNeeded, maxAllocatable);
        const minRAMGB = Math.max(1, Math.floor(maxRAMGB * 0.6));

        return {
            minMB: Math.max(1024, minRAMGB * 1024),
            maxMB: Math.max(1024, Math.min(maxRAMGB * 1024, 32768)),
            minGB: minRAMGB,
            maxGB: +maxRAMGB.toFixed(1),
        };
    }

    /**
     * Optimize edilmiş JVM argümanları üret
     */
    static generateJVMArgs(minRAMMB, maxRAMMB, isModded = true) {
        const args = [
            `-Xms${minRAMMB}M`,
            `-Xmx${maxRAMMB}M`,
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1HeapWastePercent=5',
            '-XX:G1MixedGCCountTarget=4',
            '-XX:G1MixedGCLiveThresholdPercent=90',
            '-XX:G1RSetUpdatingPauseTimePercent=5',
            '-XX:SurvivorRatio=32',
            '-XX:+PerfDisableSharedMem',
            '-XX:MaxTenuringThreshold=1',
        ];

        if (isModded) {
            args.push(
                '-XX:G1NewSizePercent=40',
                '-XX:G1MaxNewSizePercent=50',
                '-XX:G1HeapRegionSize=16M',
                '-XX:G1ReservePercent=15'
            );
        } else {
            args.push(
                '-XX:G1NewSizePercent=30',
                '-XX:G1MaxNewSizePercent=40',
                '-XX:G1HeapRegionSize=8M',
                '-XX:G1ReservePercent=20'
            );
        }

        return args.join(' ');
    }

    /**
     * Tam RAM önerisini getir
     */
    static async getRecommendation(modCount = 0) {
        const sysRAM = await this.getSystemRAM();
        const optimal = this.calculateOptimalRAM(modCount, sysRAM.totalGB);
        const jvmArgs = this.generateJVMArgs(optimal.minMB, optimal.maxMB, modCount > 0);

        return {
            system: sysRAM,
            recommended: optimal,
            jvmArgs,
            modCount,
        };
    }
}

module.exports = RAMOptimizer;
