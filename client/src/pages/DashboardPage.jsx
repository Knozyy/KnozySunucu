// client/src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/knozy/tokens';
import { Card } from '@/knozy/primitives';
import { WidgetGrid } from '@/components/Dashboard/WidgetGrid';
import { DEFAULT_LAYOUT } from '@/components/Dashboard/defaultLayout';

// ─── Canlı seri (CPU/RAM 60 örnek halka tampon) ─────────────────────────
function useLiveSeries(selectedServer) {
    const [series, setSeries] = useState(() => Array(60).fill(null).map(() => ({ cpu: 0, ram: 0 })));

    useEffect(() => {
        if (!selectedServer) return;
        const cpu = selectedServer.processStats?.cpuPercent || 0;
        const ramMB = selectedServer.processStats?.memoryMB || 0;
        const maxRamGB = selectedServer.maxRamGB || 4;
        const ram = Math.min(100, (ramMB / (maxRamGB * 1024)) * 100);
        setSeries(prev => [...prev.slice(1), { cpu, ram }]);
    }, [selectedServer]);

    return series;
}

// ─── Ana Dashboard ───────────────────────────────────────────────────────
export default function DashboardPage() {
    const { data: serversData } = useQuery({
        queryKey: ['servers-status-dash'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });
    const servers = serversData?.servers || [];

    const [selectedServerId, setSelectedServerId] = useState(null);
    useEffect(() => {
        if (!selectedServerId && servers.length > 0) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];
    const series = useLiveSeries(selectedServer);

    const { data: installedData } = useQuery({
        queryKey: ['modpacks-installed'],
        queryFn: () => api.get('/modpacks/installed').then(r => r.data),
    });

    const installedModpacks = useMemo(() => {
        const list = installedData?.modpacks || [];
        return list.map(mp => {
            const usedBy = servers.find(s => s.active_modpack_id === mp.id);
            return { ...mp, _usedByServerId: usedBy?.id || null, _usedByName: usedBy?.name || null };
        });
    }, [installedData, servers]);

    if (!servers.length) {
        return (
            <Card title="Sunucu yok" padding={24}>
                <div style={{ color: A.faint, fontSize: 13, fontFamily: A.mono, lineHeight: 1.6 }}>
                    Henüz tanımlı bir sunucu yok.{' '}
                    <a href="/servers" style={{ color: 'var(--accent)' }}>Sunucular sayfasından</a> ilk sunucuyu ekleyin.
                </div>
            </Card>
        );
    }

    if (!selectedServer) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Birden fazla sunucu varsa sekme göster */}
            {servers.length > 1 && (
                <div style={{
                    background: A.bgDeeper, border: `1px solid ${A.border}`, borderRadius: 4,
                    display: 'flex', overflowX: 'auto',
                }}>
                    {servers.map((s, i) => {
                        const active = s.id === selectedServerId;
                        return (
                            <button key={s.id} onClick={() => setSelectedServerId(s.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 16px', background: active ? A.panel : 'transparent',
                                    border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                                    color: active ? A.text : A.dim, fontSize: 12, fontWeight: 500,
                                    cursor: 'pointer', fontFamily: A.sans, whiteSpace: 'nowrap',
                                }}>
                                <span>Sunucu {i + 1}</span>
                                <span style={{ color: A.faint, fontSize: 11, fontFamily: A.mono }}>— {s.name}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Widget grid (sabit düzen) */}
            <WidgetGrid
                server={selectedServer}
                series={series}
                installedModpacks={installedModpacks}
                layout={DEFAULT_LAYOUT}/>
        </div>
    );
}
