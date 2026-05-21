import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { A, btnGhost, btnPrimary } from '@/hodo/tokens';
import {
    Cap, Num, Dot, Pill, Card, KPI, KV, Stat, MiniStat,
    ServerStatus, LegendDot, Toggle,
} from '@/hodo/primitives';
import { Sparkline, DualLine, UsageBar, avg, max } from '@/hodo/charts';
import { I } from '@/hodo/icons';

// ─── Live series (CPU/RAM/TPS 60 örnek halka tampon) ────────────────────
function useLiveSeries() {
    const { data: serversData } = useQuery({
        queryKey: ['servers-status-dash'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });
    const servers = serversData?.servers || [];

    const [series, setSeries] = useState(
        Array(60).fill(null).map(() => ({ cpu: 0, ram: 0, tps: 20, mspt: 50 }))
    );

    // Default sunucu (ilk kayıt) live örnekleri
    useEffect(() => {
        const def = servers[0];
        if (!def) return;
        const cpu = def.processStats?.cpuPercent || 0;
        const ramMB = def.processStats?.memoryMB || 0;
        const maxRamGB = parseRamGB(def.max_ram) || 8;
        const ram = Math.min(100, (ramMB / (maxRamGB * 1024)) * 100);
        setSeries(prev => [...prev.slice(1), { cpu, ram, tps: 20, mspt: 50 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serversData]);

    return { servers, series };
}

function parseRamGB(str) {
    if (!str) return 0;
    const m = String(str).match(/^(\d+)([GgMm])$/);
    if (!m) return 0;
    return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : parseInt(m[1]) / 1024;
}

// ─── Sunucu sekmesi (üst tabs) ──────────────────────────────────────────
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

// ─── Server kontrol butonları ───────────────────────────────────────────
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
                    <button onClick={() => stopM.mutate()} disabled={stopM.isPending}
                        style={btnGhost}>
                        <I.Stop size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>DURDUR
                    </button>
                    <button onClick={() => restartM.mutate()} disabled={restartM.isPending}
                        style={btnGhost}>
                        <I.Restart size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>YENİDEN
                    </button>
                </>
            )}
            {isStopping && <Pill color={A.warn} bg="rgba(251,191,36,0.10)">DURDURULUYOR</Pill>}
        </div>
    );
}

// ─── Tek sunucu paneli (KPI'lar + grafikler + profil + oyuncular) ──────
function ServerPanel({ server, series, installedModpacks }) {
    const qc = useQueryClient();
    const cpu = server.processStats?.cpuPercent || 0;
    const ramMB = server.processStats?.memoryMB || 0;
    const maxRamGB = parseRamGB(server.max_ram) || 8;
    const ramGB = ramMB / 1024;
    const ramPct = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;

    const cpuVals = series.map(s => s.cpu);
    const ramVals = series.map(s => s.ram);

    // Oyuncular
    const { data: playersData } = useQuery({
        queryKey: ['players-online', server.id],
        queryFn: () => api.get(`/players/online?serverId=${server.id}`).then(r => r.data),
        refetchInterval: 5000,
    });
    const players = playersData?.players || [];

    // Aktif profil
    const activePack = installedModpacks.find(p => p.id === server.active_modpack_id);

    // Profil ataması
    const [selectedPack, setSelectedPack] = useState(server.active_modpack_id ?? null);
    useEffect(() => { setSelectedPack(server.active_modpack_id ?? null); }, [server.id, server.active_modpack_id]);

    const setProfileM = useMutation({
        mutationFn: (modpack_id) => api.post(`/servers/${server.id}/set-profile`, { modpack_id }),
        onSuccess: () => {
            toast.success('Profil atandı');
            qc.invalidateQueries({ queryKey: ['servers-status-dash'] });
        },
        onError: (e) => {
            toast.error(e.response?.data?.error || 'Profil atanamadı');
            setSelectedPack(server.active_modpack_id ?? null);
        },
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                <KPI label="CPU" value={cpu.toFixed(1)} unit="%" spark={cpuVals} sparkMax={100}/>
                <KPI label="RAM" value={ramGB.toFixed(2)} unit={` / ${maxRamGB} GB`}
                    sub={`${ramPct.toFixed(0)}%`} spark={ramVals} sparkMax={100}/>
                <KPI label="OYUNCU" value={players.length} unit="/20"
                    sub={server.status === 'running' ? 'online' : 'offline'}/>
                <KPI label="STATUS" value={server.status.toUpperCase()}
                    sub={server.port ? `port ${server.port}` : '—'}/>
                <KPI label="PROFIL" value={activePack?.name || '—'}
                    sub={activePack?.version || ''} />
                <KPI label="SUNUCU" value={`#${server.id}`} sub={server.name}/>
            </div>

            {/* Row 2: chart + connection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 12 }}>
                <Card title="Kaynaklar (60s · canlı)" accent="var(--accent)"
                    action={
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <LegendDot color="var(--accent)" label="CPU"/>
                            <LegendDot color={A.ok} label="RAM" dashed/>
                        </div>
                    }>
                    <DualLine a={cpuVals} b={ramVals} width={780} height={180}
                        strokeA="var(--accent)" strokeB={A.ok}/>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                        marginTop: 14, paddingTop: 12, borderTop: `1px solid ${A.border}`,
                    }}>
                        <Stat label="CPU avg" value={`${avg(cpuVals).toFixed(1)}%`}/>
                        <Stat label="CPU peak" value={`${max(cpuVals).toFixed(1)}%`}/>
                        <Stat label="RAM avg" value={`${avg(ramVals).toFixed(1)}%`}/>
                        <Stat label="RAM peak" value={`${max(ramVals).toFixed(1)}%`}/>
                    </div>
                </Card>

                <Card title="Sunucu Bilgisi" accent={A.ok}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <KV label="ad" value={server.name} mono/>
                        <KV label="port" value={server.port || '—'} mono/>
                        <KV label="ram min" value={server.min_ram || '—'} mono/>
                        <KV label="ram max" value={server.max_ram || '—'} mono/>
                        <KV label="path" value={server.path || '—'} mono valueColor={A.dim}/>
                        <KV label="durum" value={server.status} mono valueColor={
                            server.status === 'running' ? A.ok :
                            server.status === 'starting' ? A.warn : A.dim
                        }/>
                    </div>
                </Card>
            </div>

            {/* Row 3: players + active profile + control */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                <Card title={`Online Oyuncular · ${players.length}`} accent="var(--accent)">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {players.length === 0 ? (
                            <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                                Şu an online oyuncu yok
                            </div>
                        ) : (
                            players.map((p, i) => (
                                <div key={p} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 0',
                                    borderTop: i ? `1px solid ${A.border}` : 'none',
                                }}>
                                    <div style={{
                                        width: 26, height: 26, borderRadius: 1,
                                        background: 'var(--accent)', display: 'grid',
                                        placeItems: 'center', color: A.bg,
                                        fontFamily: A.mono, fontWeight: 700, fontSize: 10,
                                    }}>{p.slice(0, 2).toUpperCase()}</div>
                                    <div style={{ flex: 1, fontSize: 12, color: A.text }}>{p}</div>
                                    <Dot color={A.ok} size={6}/>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                <Card title="Aktif Profil" accent={A.ok}>
                    {activePack ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>{activePack.name}</div>
                                    <div style={{ fontSize: 11, color: A.faint, marginTop: 2, fontFamily: A.mono }}>
                                        v{activePack.version || '?'}
                                    </div>
                                </div>
                                <Pill color={A.ok} bg="rgba(74,222,128,0.10)">ACTIVE</Pill>
                            </div>
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: 6,
                                paddingTop: 8, borderTop: `1px solid ${A.border}`,
                            }}>
                                <Cap>HEAP</Cap>
                                <UsageBar value={ramPct} color="var(--accent)"/>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    fontFamily: A.mono, fontSize: 11, color: A.dim,
                                }}>
                                    <span>{ramGB.toFixed(2)} / {maxRamGB} GB</span>
                                    <span>{ramPct.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                            Henüz profil atanmamış
                        </div>
                    )}
                </Card>

                <Card title="Profil Seç" accent={A.warn}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select
                            value={selectedPack || ''}
                            onChange={(e) => {
                                const id = e.target.value ? parseInt(e.target.value) : null;
                                setSelectedPack(id);
                                setProfileM.mutate(id);
                            }}
                            style={{
                                background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.mono, fontSize: 12,
                                padding: '8px 10px', borderRadius: 2, outline: 'none',
                            }}>
                            <option value="">— profil seç —</option>
                            {installedModpacks.map(mp => {
                                const isUsedElsewhere = mp._usedByServerId && mp._usedByServerId !== server.id;
                                return (
                                    <option key={mp.id} value={mp.id} disabled={isUsedElsewhere}>
                                        {mp.name} {isUsedElsewhere ? `(sunucu ${mp._usedByName})` : ''}
                                    </option>
                                );
                            })}
                        </select>
                        <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, lineHeight: 1.5 }}>
                            Her profil aynı anda yalnızca bir sunucuda kullanılabilir.
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

// ─── Ana Dashboard ──────────────────────────────────────────────────────
export default function DashboardPage() {
    const { user } = useAuth();
    const qc = useQueryClient();
    const { servers, series } = useLiveSeries();
    const [selectedServerId, setSelectedServerId] = useState(null);

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

    // İlk yüklemede ilk sunucuyu seç
    useEffect(() => {
        if (!selectedServerId && servers.length > 0) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];
    const onStatusChange = () => qc.invalidateQueries({ queryKey: ['servers-status-dash'] });

    if (!servers.length) {
        return (
            <Card title="Sunucu yok" padding={24}>
                <div style={{ color: A.faint, fontSize: 13, fontFamily: A.mono, lineHeight: 1.6 }}>
                    Henüz tanımlı bir sunucu yok. <a href="/servers" style={{ color: 'var(--accent)' }}>Sunucular sayfasından</a> ilk sunucuyu ekleyin.
                </div>
            </Card>
        );
    }

    if (!selectedServer) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Server tabs + kontrol stripi */}
            <div style={{
                background: A.bgDeeper, border: `1px solid ${A.border}`, borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 0,
            }}>
                <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
                    {servers.map((s, i) => (
                        <ServerTab key={s.id} server={s} index={i}
                            active={s.id === selectedServerId}
                            onClick={() => setSelectedServerId(s.id)}/>
                    ))}
                </div>
                <div style={{ padding: '8px 16px', borderLeft: `1px solid ${A.border}` }}>
                    <ServerControls server={selectedServer} onStatusChange={onStatusChange}/>
                </div>
            </div>

            <ServerPanel server={selectedServer} series={series} installedModpacks={installedModpacks}/>
        </div>
    );
}
