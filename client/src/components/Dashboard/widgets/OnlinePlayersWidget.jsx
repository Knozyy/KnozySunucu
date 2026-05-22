// client/src/components/Dashboard/widgets/OnlinePlayersWidget.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/hodo/tokens';
import { Card, Dot } from '@/hodo/primitives';

export function OnlinePlayersWidget({ server }) {
    const { data } = useQuery({
        queryKey: ['players-online', server?.id],
        queryFn: () => api.get(`/players/online?serverId=${server?.id}`).then(r => r.data),
        refetchInterval: 5000,
        enabled: !!server?.id,
    });
    const players = data?.players || [];

    return (
        <Card title={`Online Oyuncular · ${players.length}`} accent="var(--accent)"
            style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 220 }}>
                {players.length === 0 ? (
                    <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                        Şu an online oyuncu yok
                    </div>
                ) : players.map((p, i) => (
                    <div key={p} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0',
                        borderTop: i ? `1px solid ${A.border}` : 'none',
                    }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: 1, flexShrink: 0,
                            background: 'var(--accent)', display: 'grid',
                            placeItems: 'center', color: A.bg,
                            fontFamily: A.mono, fontWeight: 700, fontSize: 10,
                        }}>{p.slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1, fontSize: 12, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
                        <Dot color={A.ok} size={6}/>
                    </div>
                ))}
            </div>
        </Card>
    );
}
