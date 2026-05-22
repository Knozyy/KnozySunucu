// client/src/components/Dashboard/widgets/UptimeKpi.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { KPI } from '@/hodo/primitives';
import { formatUptime } from '@/utils/formatters';

export function UptimeKpi({ server }) {
    const { data } = useQuery({
        queryKey: ['system-uptime'],
        queryFn: () => api.get('/system/uptime').then(r => r.data),
        refetchInterval: 30000,
        enabled: !!server?.id,
    });
    return (
        <KPI label="UPTIME"
            value={data?.uptime ? formatUptime(data.uptime) : '—'}
            sub="çalışma süresi"/>
    );
}
