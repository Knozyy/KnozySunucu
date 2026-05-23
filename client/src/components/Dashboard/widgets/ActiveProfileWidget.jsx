// client/src/components/Dashboard/widgets/ActiveProfileWidget.jsx
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A } from '@/hodo/tokens';
import { Card, Cap, Pill } from '@/hodo/primitives';
import { UsageBar } from '@/hodo/charts';

function fmtBytes(b) {
    if (!b || b < 1) return '—';
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(1)} KB`;
}

function MiniBox({ label, value }) {
    return (
        <div style={{
            background: A.bgDeeper, border: `1px solid ${A.border}`,
            borderRadius: 4, padding: '10px 12px', textAlign: 'left',
        }}>
            <Cap>{label}</Cap>
            <div style={{
                fontFamily: A.mono, fontSize: 14, fontWeight: 600,
                color: A.text, marginTop: 4, letterSpacing: '-0.01em',
            }}>{value}</div>
        </div>
    );
}

export function ActiveProfileWidget({ server, installedModpacks }) {
    const qc = useQueryClient();
    const activePack = (installedModpacks || []).find(p => p.id === server?.active_modpack_id);

    const ramMB     = server?.processStats?.memoryMB || 0;
    const maxRamGB  = server?.maxRamGB || 4;
    const ramGB     = ramMB / 1024;
    const ramPct    = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;

    const [selectedPack, setSelectedPack] = useState(server?.active_modpack_id ?? null);
    useEffect(() => { setSelectedPack(server?.active_modpack_id ?? null); }, [server?.id, server?.active_modpack_id]);

    // Mod sayısı + boyut
    const { data: modsData } = useQuery({
        queryKey: ['mods', server?.id],
        queryFn: () => api.get(`/mods?serverId=${server?.id}`).then(r => r.data),
        enabled: !!server?.id,
        staleTime: 60000,
    });
    const { data: worldsData } = useQuery({
        queryKey: ['worlds', server?.id],
        queryFn: () => api.get(`/worlds?serverId=${server?.id}`).then(r => r.data),
        enabled: !!server?.id,
        staleTime: 60000,
    });

    // modsData.count: { active, disabled, total } — sadece total'ı kullan
    const modCount = typeof modsData?.count === 'object'
        ? modsData.count?.total ?? null
        : (modsData?.count ?? null);
    const totalSize = worldsData?.totalSize?.formatted ?? '—';
    const mcVer = server?.connection?.mcVersion;
    const loader = server?.connection?.loader;
    const javaVer = activePack?.java_version || '21';

    const setProfileM = useMutation({
        mutationFn: (modpack_id) => api.post(`/servers/${server?.id}/set-profile`, { modpack_id }),
        onSuccess: () => { toast.success('Profil atandı'); qc.invalidateQueries({ queryKey: ['servers-status-dash'] }); },
        onError: (e) => { toast.error(e.response?.data?.error || 'Profil atanamadı'); setSelectedPack(server?.active_modpack_id ?? null); },
    });

    return (
        <Card title="aktif profil" accent={A.ok} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                {activePack ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 600, color: A.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{activePack.name}</div>
                                <div style={{ fontSize: 11, color: A.faint, marginTop: 3, fontFamily: A.mono }}>
                                    v{activePack.version || '?'}
                                    {mcVer && <> · MC {mcVer}</>}
                                </div>
                            </div>
                            <Pill color={A.ok} bg="rgba(74,222,128,0.10)">ACTIVE</Pill>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            <MiniBox label="MODS" value={modCount != null ? modCount : '—'}/>
                            <MiniBox label="SIZE" value={totalSize}/>
                            <MiniBox label="JAVA" value={javaVer}/>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${A.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <Cap>HEAP</Cap>
                                <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>
                                    {ramPct.toFixed(0)}%
                                </span>
                            </div>
                            <UsageBar value={ramPct} color="var(--accent)" height={4}/>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: A.mono, fontSize: 11, color: A.dim, marginTop: 6 }}>
                                <span>{ramGB.toFixed(2)} / {maxRamGB.toFixed(2)} GB</span>
                                {loader && <span style={{ color: A.faint }}>{loader}</span>}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ color: A.faint, fontSize: 12, padding: '14px 0', textAlign: 'center' }}>
                            Henüz profil atanmamış
                        </div>
                        <select
                            value={selectedPack || ''}
                            onChange={(e) => {
                                const id = e.target.value ? parseInt(e.target.value) : null;
                                setSelectedPack(id);
                                setProfileM.mutate(id);
                            }}
                            style={{
                                background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.mono, fontSize: 11,
                                padding: '6px 8px', borderRadius: 2, outline: 'none',
                            }}>
                            <option value="">— profil seç —</option>
                            {(installedModpacks || []).map(mp => {
                                const isUsed = mp._usedByServerId && mp._usedByServerId !== server?.id;
                                return (
                                    <option key={mp.id} value={mp.id} disabled={isUsed}>
                                        {mp.name}{isUsed ? ` (sunucu ${mp._usedByName})` : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </>
                )}
            </div>
        </Card>
    );
}
