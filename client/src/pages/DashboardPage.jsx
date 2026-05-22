// client/src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnGhost, btnPrimary } from '@/hodo/tokens';
import { Dot, Pill, Card } from '@/hodo/primitives';
import { I } from '@/hodo/icons';
import { WidgetGrid } from '@/components/Dashboard/WidgetGrid';
import { useWidgetLayout } from '@/components/Dashboard/useWidgetLayout';
import { WIDGET_LABELS } from '@/components/Dashboard/widgetMap';

// ─── Live series (CPU/RAM 60 örnek halka tampon) ─────────────────────────
function useLiveSeries() {
    const { data: serversData } = useQuery({
        queryKey: ['servers-status-dash'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });
    const servers = serversData?.servers || [];

    const [series, setSeries] = useState(
        Array(60).fill(null).map(() => ({ cpu: 0, ram: 0 }))
    );

    useEffect(() => {
        const def = servers[0];
        if (!def) return;
        const cpu = def.processStats?.cpuPercent || 0;
        const ramMB = def.processStats?.memoryMB || 0;
        const maxRamGB = parseRamGBLocal(def.max_ram) || 8;
        const ram = Math.min(100, (ramMB / (maxRamGB * 1024)) * 100);
        setSeries(prev => [...prev.slice(1), { cpu, ram }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serversData]);

    return { servers, series };
}

function parseRamGBLocal(str) {
    if (!str) return 0;
    const m = String(str).match(/^(\d+)([GgMm])$/);
    if (!m) return 0;
    return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : parseInt(m[1]) / 1024;
}

// ─── Sunucu sekmesi ──────────────────────────────────────────────────────
function ServerTab({ server, active, onClick, index }) {
    const isRunning = server.status === 'running';
    const isStarting = server.status === 'starting';
    return (
        <button onClick={onClick} className="hodo-navitem"
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', cursor: 'pointer',
                background: active ? A.panel : 'transparent',
                border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? A.text : A.dim, fontSize: 12, fontWeight: 500,
                fontFamily: A.sans, whiteSpace: 'nowrap',
            }}>
            <Dot color={isRunning ? A.ok : isStarting ? A.warn : A.faint} size={6}/>
            <span style={{ color: active ? A.text : A.dim }}>Sunucu {index + 1}</span>
            <span style={{ color: A.faint, fontSize: 11, fontFamily: A.mono }}>— {server.name}</span>
        </button>
    );
}

// ─── Sunucu kontrol butonları ────────────────────────────────────────────
function ServerControls({ server, onStatusChange }) {
    const isRunning = server.status === 'running';
    const isStarting = server.status === 'starting';
    const isStopping = server.status === 'stopping';

    const startM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/start`),
        onSuccess: () => { toast.success('Başlatılıyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const stopM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/stop`),
        onSuccess: () => { toast.success('Durduruluyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const restartM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/restart`),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    return (
        <div style={{ display: 'flex', gap: 8 }}>
            {!isRunning && !isStarting && (
                <button onClick={() => startM.mutate()} disabled={startM.isPending}
                    style={{ ...btnPrimary, opacity: startM.isPending ? 0.5 : 1 }}>
                    <I.Play size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>BAŞLAT
                </button>
            )}
            {(isRunning || isStarting) && (
                <>
                    <button onClick={() => stopM.mutate()} disabled={stopM.isPending} style={btnGhost}>
                        <I.Stop size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>DURDUR
                    </button>
                    <button onClick={() => restartM.mutate()} disabled={restartM.isPending} style={btnGhost}>
                        <I.Restart size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>YENİDEN
                    </button>
                </>
            )}
            {isStopping && <Pill color={A.warn} bg="rgba(251,191,36,0.10)">DURDURULUYOR</Pill>}
        </div>
    );
}

// ─── Ana Dashboard ───────────────────────────────────────────────────────
export default function DashboardPage() {
    const qc = useQueryClient();
    const { servers, series } = useLiveSeries();
    const [selectedServerId, setSelectedServerId] = useState(null);
    const {
        layout, setLayout,
        editMode, toggleEditMode,
        loading,
        save, cancel, reset,
        deleteWidget, addWidget,
        hiddenWidgets,
    } = useWidgetLayout();

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

    useEffect(() => {
        if (!selectedServerId && servers.length > 0) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];
    const onStatusChange = () => qc.invalidateQueries({ queryKey: ['servers-status-dash'] });

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
            {/* ── Sunucu sekmeleri + kontroller ── */}
            <div style={{
                background: A.bgDeeper, border: `1px solid ${A.border}`, borderRadius: 4,
                display: 'flex', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
                    {servers.map((s, i) => (
                        <ServerTab key={s.id} server={s} index={i}
                            active={s.id === selectedServerId}
                            onClick={() => setSelectedServerId(s.id)}/>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderLeft: `1px solid ${A.border}` }}>
                    <ServerControls server={selectedServer} onStatusChange={onStatusChange}/>
                    <button onClick={toggleEditMode} style={{
                        ...btnGhost, fontSize: 10,
                        display: 'flex', alignItems: 'center', gap: 5,
                        borderColor: editMode ? 'var(--accent)' : A.border,
                        color: editMode ? 'var(--accent)' : A.dim,
                    }}>
                        <I.Cog size={11}/>{editMode ? 'DÜZENLEME' : 'DÜZENLE'}
                    </button>
                </div>
            </div>

            {/* ── Edit modu araç çubuğu ── */}
            {editMode && (
                <div style={{
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 4, padding: '10px 16px',
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                    <span style={{ fontSize: 12, color: A.dim, flex: 1, minWidth: 120 }}>
                        Widget'ları sürükle-bırak ile taşı, köşeden boyutlandır
                    </span>
                    {hiddenWidgets.length > 0 && hiddenWidgets.map(w => (
                        <button key={w.i} onClick={() => addWidget(w.i)}
                            style={{ ...btnGhost, fontSize: 10 }}>
                            + {WIDGET_LABELS[w.i] || w.i}
                        </button>
                    ))}
                    <button
                        onClick={async () => {
                            try { await reset(); toast.success('Yerleşim sıfırlandı'); }
                            catch { toast.error('Sıfırlama başarısız'); }
                        }}
                        style={{ ...btnGhost, fontSize: 10 }}>
                        Sıfırla
                    </button>
                    <button onClick={cancel} style={{ ...btnGhost, fontSize: 10 }}>İptal</button>
                    <button
                        onClick={async () => {
                            try { await save(); toast.success('Yerleşim kaydedildi'); }
                            catch { toast.error('Kaydetme başarısız'); }
                        }}
                        style={{ ...btnPrimary, fontSize: 10 }}>
                        Kaydet
                    </button>
                </div>
            )}

            {/* ── Widget grid ── */}
            {!loading && (
                <WidgetGrid
                    server={selectedServer}
                    series={series}
                    installedModpacks={installedModpacks}
                    layout={layout}
                    editMode={editMode}
                    onLayoutChange={setLayout}
                    onDeleteWidget={deleteWidget}
                />
            )}
        </div>
    );
}
