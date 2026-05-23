// client/src/components/Dashboard/widgets/RamKpi.jsx
import { KPI } from '@/hodo/primitives';

export function RamKpi({ server, series }) {
    const ramMB = server?.processStats?.memoryMB || 0;
    // Backend artık etkin -Xmx değerini GB cinsinden döndürüyor (modpack veya jvm_args'tan)
    const maxRamGB = server?.maxRamGB || 4;
    const ramGB = ramMB / 1024;
    const ramPct = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;
    const ramVals = (series || []).map(s => s.ram);
    return (
        <KPI label="RAM"
            value={ramGB.toFixed(2)}
            unit={` / ${maxRamGB} GB`}
            sub={`${ramPct.toFixed(0)}%`}
            spark={ramVals}
            sparkMax={100}/>
    );
}
