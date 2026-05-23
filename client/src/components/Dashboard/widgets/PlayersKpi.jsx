// client/src/components/Dashboard/widgets/PlayersKpi.jsx
import { KPI } from '@/hodo/primitives';

export function PlayersKpi({ server }) {
    const count = server?.playerCount ?? 0;
    const maxPlayers = server?.connection?.maxPlayers || 20;
    const isOnline = server?.status === 'running';
    return (
        <KPI label="OYUNCULAR"
            value={count}
            unit={`/${maxPlayers}`}
            sub={isOnline ? `${maxPlayers - count} offline` : 'sunucu kapalı'}/>
    );
}
