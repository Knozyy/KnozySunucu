const si = require('systeminformation');

/**
 * RAM Optimizer - Mod sayısına göre RAM önerisi ve JVM args üretimi
 * Tutarlı kademeli hesaplama kullanır
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
            usedGB: +(mem.active / (1024 ** 3)).toFixed(2),
            totalMB: Math.floor(mem.total / (1024 ** 2)),
            availableMB: Math.floor(mem.available / (1024 ** 2)),
        };
    }

    /**
     * Mod sayısına göre optimal RAM hesapla
     * Formül: base(2GB) + lineer mod etkisi (her 10 mod için ~0.3GB)
     * Sistem limiti: OS için %20 veya min 2GB bırak
     */
    static calculateOptimalRAM(modCount = 0, systemRAMGB = 16) {
        // Baz RAM (vanilla server)
        const baseGB = 2.0;

        // Lineer mod etkisi: her 10 mod ~0.3GB
        const modImpactGB = Math.ceil(modCount * 0.03 * 10) / 10;

        const totalNeeded = baseGB + modImpactGB;

        // Sistem sınırları: OS için %20 veya min 2GB bırak
        const osReserve = Math.max(2, Math.ceil(systemRAMGB * 0.2));
        const maxAllocatable = Math.max(2, systemRAMGB - osReserve);

        // Gerçekçi üst sınır
        const maxRAMGB = Math.min(totalNeeded, maxAllocatable, 16);
        const minRAMGB = Math.max(1, Math.floor(maxRAMGB * 0.6));

        return {
            minMB: Math.max(1024, minRAMGB * 1024),
            maxMB: Math.max(1024, Math.min(maxRAMGB * 1024, 16384)),
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
