/**
 * Loader tipine ve startup moduna göre başlatma scriptleri üretir
 */
class ScriptGenerator {
    /**
     * @param {string} loader - 'forge' | 'neoforge' | 'direct'
     * @param {string} startupMode - 'new' | 'old' | 'direct'
     * @param {{ maxRam, minRam, jarName }} opts
     */
    generateStartSh(loader, startupMode, opts = {}) {
        const maxRam = opts.maxRam || '4G';
        const minRam = opts.minRam || '2G';

        if (startupMode === 'fabric') {
            const jarName = opts.jarName && opts.jarName.startsWith('fabric-server-launch')
                ? opts.jarName : 'fabric-server-launch.jar';
            return `#!/bin/bash
# Fabric Sunucu Başlatma Scripti
# Knozy Sunucu Paneli tarafından oluşturuldu
cd "$(dirname "$0")"
java -Xmx${maxRam} -Xms${minRam} -jar ${jarName} nogui
`;
        }

        if (startupMode === 'new') {
            const label = loader === 'neoforge' ? 'NeoForge' : 'Forge';
            return `#!/bin/bash
# ${label} Sunucu Başlatma Scripti
# Knozy Sunucu Paneli tarafından oluşturuldu
cd "$(dirname "$0")"

if [ -f "run.sh" ]; then
    bash run.sh
elif [ -f "forge.sh" ]; then
    bash forge.sh
else
    echo "[HATA] run.sh bulunamadi. ${label} installer'i calistirin: --installServer"
    exit 1
fi
`;
        }

        const jarName = opts.jarName || (startupMode === 'old' ? 'forge-server.jar' : 'server.jar');
        return `#!/bin/bash
# Sunucu Başlatma Scripti
# Knozy Sunucu Paneli tarafından oluşturuldu
cd "$(dirname "$0")"
java -Xmx${maxRam} -Xms${minRam} -jar ${jarName} nogui
`;
    }

    generateStartBat(loader, startupMode, opts = {}) {
        const maxRam = opts.maxRam || '4G';
        const minRam = opts.minRam || '2G';

        if (startupMode === 'fabric') {
            const jarName = opts.jarName && opts.jarName.startsWith('fabric-server-launch')
                ? opts.jarName : 'fabric-server-launch.jar';
            return `@echo off
rem Fabric Sunucu Baslama Scripti
rem Knozy Sunucu Paneli tarafindan olusturuldu
cd /d "%~dp0"
java -Xmx${maxRam} -Xms${minRam} -jar ${jarName} nogui
pause
`;
        }

        if (startupMode === 'new') {
            const label = loader === 'neoforge' ? 'NeoForge' : 'Forge';
            return `@echo off
rem ${label} Sunucu Baslama Scripti
rem Knozy Sunucu Paneli tarafindan olusturuldu
cd /d "%~dp0"

if exist run.bat (
    call run.bat
) else if exist forge.bat (
    call forge.bat
) else (
    echo [HATA] run.bat bulunamadi. ${label} installer'i calistirin: --installServer
    pause
)
`;
        }

        const jarName = opts.jarName || (startupMode === 'old' ? 'forge-server.jar' : 'server.jar');
        return `@echo off
rem Sunucu Baslama Scripti
rem Knozy Sunucu Paneli tarafindan olusturuldu
cd /d "%~dp0"
java -Xmx${maxRam} -Xms${minRam} -jar ${jarName} nogui
pause
`;
    }

    generateUserJvmArgs(maxRam = '4G', minRam = '2G') {
        return `# JVM Argumanlari - Knozy Sunucu Paneli
# Forge / NeoForge tarafindan okunur
-Xmx${maxRam}
-Xms${minRam}
# Performans bayraklari (Aikar's Flags)
-XX:+UseG1GC
-XX:+ParallelRefProcEnabled
-XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions
-XX:+DisableExplicitGC
-XX:+AlwaysPreTouch
-XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40
-XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20
-XX:G1HeapWastePercent=5
-XX:G1MixedGCCountTarget=4
-XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90
-XX:G1RSetUpdatingPauseTimePercent=5
-XX:SurvivorRatio=32
-XX:+PerfDisableSharedMem
-XX:MaxTenuringThreshold=1
`;
    }
}

module.exports = new ScriptGenerator();
