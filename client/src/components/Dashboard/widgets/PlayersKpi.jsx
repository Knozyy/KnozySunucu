// client/src/components/Dashboard/widgets/PlayersKpi.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { KPI } from '@/hodo/primitives';

export function PlayersKpi({ server }) {
    const { data } = useQuery({
        queryKey: ['players-online', server?.id],
        queryFn: () => api.get(`/players/online?serverId=${server?.id}`).then(r => r.data),
        refetchInterval: 5000,
        enabled: !!server?.id,
    });
    const count = data?.players?.length || 0;
    return (
        <KPI label="OYUNCU"
            value={count}
            unit="/20"
            sub={server?.status === 'running' ? 'online' : 'offline'}/>
    );
}
