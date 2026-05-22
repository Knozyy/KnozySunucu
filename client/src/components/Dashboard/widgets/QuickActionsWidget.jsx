// client/src/components/Dashboard/widgets/QuickActionsWidget.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Card, Pill } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

export function QuickActionsWidget({ server }) {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['servers-status-dash'] });

    const startM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/start`),
        onSuccess: () => { toast.success('Başlatılıyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const stopM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/stop`),
        onSuccess: () => { toast.success('Durduruluyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const restartM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/restart`),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const isRunning = server?.status === 'running';
    const isStarting = server?.status === 'starting';
    const isStopping = server?.status === 'stopping';

    return (
        <Card title="Hızlı İşlemler" style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isRunning && !isStarting && (
                    <button onClick={() => startM.mutate()} disabled={startM.isPending}
                        style={{ ...btnPrimary, opacity: startM.isPending ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <I.Play size={11}/>BAŞLAT
                    </button>
                )}
                {(isRunning || isStarting) && (
                    <>
                        <button onClick={() => stopM.mutate()} disabled={stopM.isPending}
                            style={{ ...btnGhost, opacity: stopM.isPending ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <I.Stop size={11}/>DURDUR
                        </button>
                        <button onClick={() => restartM.mutate()} disabled={restartM.isPending}
                            style={{ ...btnGhost, opacity: restartM.isPending ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <I.Restart size={11}/>YENİDEN BAŞLAT
                        </button>
                    </>
                )}
                {isStopping && <Pill color={A.warn} bg="rgba(251,191,36,0.10)">DURDURULUYOR</Pill>}
                {!server && (
                    <div style={{ fontSize: 12, color: A.faint, textAlign: 'center', padding: '8px 0' }}>
                        Sunucu seçilmedi
                    </div>
                )}
            </div>
        </Card>
    );
}
