// client/src/components/Dashboard/widgets/ActiveProfileWidget.jsx
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A } from '@/hodo/tokens';
import { Card, Cap, Pill } from '@/hodo/primitives';
import { UsageBar } from '@/hodo/charts';
import { parseRamGB } from '@/utils/formatters';

export function ActiveProfileWidget({ server, installedModpacks }) {
    const qc = useQueryClient();
    const activePack = (installedModpacks || []).find(p => p.id === server?.active_modpack_id);
    const ramMB = server?.processStats?.memoryMB || 0;
    const maxRamGB = parseRamGB(server?.max_ram) || 8;
    const ramGB = ramMB / 1024;
    const ramPct = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;

    const [selectedPack, setSelectedPack] = useState(server?.active_modpack_id ?? null);
    useEffect(() => { setSelectedPack(server?.active_modpack_id ?? null); }, [server?.id, server?.active_modpack_id]);

    const setProfileM = useMutation({
        mutationFn: (modpack_id) => api.post(`/servers/${server?.id}/set-profile`, { modpack_id }),
        onSuccess: () => { toast.success('Profil atandı'); qc.invalidateQueries({ queryKey: ['servers-status-dash'] }); },
        onError: (e) => { toast.error(e.response?.data?.error || 'Profil atanamadı'); setSelectedPack(server?.active_modpack_id ?? null); },
    });

    return (
        <Card title="Aktif Profil" accent={A.ok} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activePack ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{activePack.name}</div>
                                <div style={{ fontSize: 11, color: A.faint, marginTop: 2, fontFamily: A.mono }}>v{activePack.version || '?'}</div>
                            </div>
                            <Pill color={A.ok} bg="rgba(74,222,128,0.10)">ACTIVE</Pill>
                        </div>
                        <div style={{ paddingTop: 8, borderTop: `1px solid ${A.border}` }}>
                            <Cap>HEAP</Cap>
                            <UsageBar value={ramPct} color="var(--accent)"/>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: A.mono, fontSize: 11, color: A.dim, marginTop: 4 }}>
                                <span>{ramGB.toFixed(2)} / {maxRamGB} GB</span>
                                <span>{ramPct.toFixed(0)}%</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ color: A.faint, fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
                        Henüz profil atanmamış
                    </div>
                )}
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
                        padding: '6px 8px', borderRadius: 2, outline: 'none', marginTop: 'auto',
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
            </div>
        </Card>
    );
}
