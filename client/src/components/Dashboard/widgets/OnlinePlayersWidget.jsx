// client/src/components/Dashboard/widgets/OnlinePlayersWidget.jsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/hodo/tokens';
import { Card } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

const ROLE_COLOR = {
    ADMIN:  A.err,
    OP:     A.warn,
    MOD:    A.ok,
    PLAYER: A.dim,
};

function fmtPlaytime(sec) {
    if (!sec) return '—';
    const h = Math.floor(sec / 3600);
    if (h > 0) return `${h}h`;
    const m = Math.floor(sec / 60);
    return `${m}m`;
}

function pingColor(ping) {
    if (ping == null) return A.faint;
    if (ping < 50)  return A.ok;
    if (ping < 100) return A.text;
    return A.err;
}

export function OnlinePlayersWidget({ server }) {
    const [search, setSearch] = useState('');

    const { data } = useQuery({
        queryKey: ['players-online', server?.id],
        queryFn: () => api.get(`/players/online?serverId=${server?.id}`).then(r => r.data),
        refetchInterval: 5000,
        enabled: !!server?.id,
    });

    const players = useMemo(() => {
        const list = data?.players || [];
        // Backward compat: eğer string array gelirse object'e dönüştür
        const norm = list.map(p => typeof p === 'string'
            ? { name: p, role: 'PLAYER', playtimeSec: 0, ping: null }
            : p);
        if (!search.trim()) return norm;
        const q = search.toLowerCase();
        return norm.filter(p => p.name.toLowerCase().includes(q));
    }, [data, search]);

    return (
        <Card title={`çevrimiçi oyuncular · ${players.length}`} accent="var(--accent)"
            style={{ height: '100%' }}
            action={
                <div style={{ position: 'relative', width: 110 }}>
                    <I.Search size={11} style={{
                        position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
                        color: A.faint,
                    }}/>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ARA..."
                        style={{
                            background: A.bg, border: `1px solid ${A.border}`, color: A.text,
                            fontSize: 10, fontFamily: A.mono, letterSpacing: '0.06em',
                            padding: '4px 8px 4px 22px', borderRadius: 2, outline: 'none',
                            width: '100%', textTransform: 'uppercase',
                        }}/>
                </div>
            }>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '34px 1.6fr 1fr 1fr 0.8fr',
                    gap: 8, padding: '4px 0',
                    fontSize: 9.5, color: A.faint, fontFamily: A.mono,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    borderBottom: `1px solid ${A.border}`,
                }}>
                    <span/>
                    <span>player</span>
                    <span>role</span>
                    <span>playtime</span>
                    <span>ping</span>
                </div>

                {players.length === 0 ? (
                    <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                        Şu an online oyuncu yok
                    </div>
                ) : players.map((p, i) => (
                    <div key={p.name} style={{
                        display: 'grid',
                        gridTemplateColumns: '34px 1.6fr 1fr 1fr 0.8fr',
                        gap: 8, padding: '9px 0', alignItems: 'center',
                        borderBottom: i !== players.length - 1 ? `1px solid ${A.border}` : 'none',
                    }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: 2,
                            background: 'var(--accent)', display: 'grid', placeItems: 'center',
                            color: A.bg, fontFamily: A.mono, fontWeight: 700, fontSize: 11,
                        }}>{p.name.slice(0, 1).toUpperCase()}</div>
                        <span style={{
                            fontSize: 12.5, color: A.text, fontWeight: 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.name}</span>
                        <span style={{
                            fontSize: 11, fontFamily: A.mono, letterSpacing: '0.06em',
                            color: ROLE_COLOR[p.role] || A.dim, textTransform: 'uppercase',
                        }}>{p.role}</span>
                        <span style={{ fontSize: 12, fontFamily: A.mono, color: A.dim }}>
                            {fmtPlaytime(p.playtimeSec)}
                        </span>
                        <span style={{ fontSize: 12, fontFamily: A.mono, color: pingColor(p.ping) }}>
                            {p.ping != null ? `${p.ping}ms` : '—'}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
