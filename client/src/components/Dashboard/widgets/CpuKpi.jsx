// client/src/components/Dashboard/widgets/CpuKpi.jsx
import { KPI } from '@/hodo/primitives';

export function CpuKpi({ server, series }) {
    const cpu = server?.processStats?.cpuPercent || 0;
    const cpuVals = (series || []).map(s => s.cpu);
    return (
        <KPI label="CPU"
            value={cpu.toFixed(1)}
            unit="%"
            spark={cpuVals}
            sparkMax={100}/>
    );
}
