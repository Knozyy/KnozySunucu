// client/src/components/Dashboard/widgets/RamKpi.jsx
import { KPI } from '@/hoodoo/primitives';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export function RamKpi({ server, series }) {
    const { data: usage } = useQuery({
        queryKey: ['system-usage'],
        queryFn: () => api.get('/system/usage').then(r => r.data),
        refetchInterval: 3000,
    });

    // systeminformation memory values are in bytes, so divide by 1024^3 for GB
    const memTotalGB = (usage?.memory?.total || 16 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024);
    const memUsedGB = (usage?.memory?.used || 0) / (1024 * 1024 * 1024);
    const ramPct = memTotalGB > 0 ? Math.min(100, (memUsedGB / memTotalGB) * 100) : 0;
    
    // Sparkline için hala server'ın (veya sistemin) kullanım serisini alabiliriz. 
    // system-usage history'de de var: usage.history
    const ramVals = (usage?.history || []).map(s => {
        const t = s.memory?.total || 1;
        const u = s.memory?.used || 0;
        return (u / t) * 100;
    });

    // Eğer usage.history henüz yoksa series'deki veriyi göster (görsellik için)
    const sparkData = ramVals.length > 0 ? ramVals : (series || []).map(s => s.ram);

    return (
        <KPI label="CİHAZ RAM"
            value={memUsedGB.toFixed(2)}
            unit={` / ${memTotalGB.toFixed(0)} GB`}
            sub={`${ramPct.toFixed(0)}%`}
            spark={sparkData}
            sparkMax={100}/>
    );
}
