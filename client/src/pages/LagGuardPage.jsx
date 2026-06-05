import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Num, Pill, Card, KPI, Input } from '@/hoodoo/primitives';
import { AreaChart, avg, max as arrMax } from '@/hoodoo/charts';
import { I } from '@/hoodoo/icons';

const LEVELS = {
    unknown:  { color: '#5f6368', label: 'VERİ YOK' },
    stable:   { color: '#4ade80', label: 'STABİL' },
    minor:    { color: '#fbbf24', label: 'HAFİF LAG' },
    warn:     { color: '#fb923c', label: 'LAG' },
    critical: { color: '#f87171', label: 'AĞIR LAG' },
};

export default function LagGuardPage() {
    const [obsSeconds, setObsSeconds] = useState(20);
    const [obsResult, setObsResult] = useState(null);

    const { data: status } = useQuery({
        queryKey: ['lagguard-status'],
        queryFn: () => api.get('/lag-guard/status').then(r => r.data),
        refetchInterval: 2500,
    });

    const runObservable = useMutation({
        mutationFn: (seconds) => api.post('/lag-guard/observable/run', { seconds }).then(r => r.data),
        onMutate: () => { setObsResult(null); toast.loading('Observable profili çalışıyor…', { id: 'obs' }); },
        onSuccess: (data) => {
            setObsResult(data);
            toast.dismiss('obs');
            if (data.ok) toast.success('Profil sonucu yakalandı'); else toast.error(data.note || 'URL yakalanamadı');
        },
        onError: (err) => { toast.dismiss('obs'); toast.error(err.response?.data?.error || 'Profil çalıştırılamadı'); },
    });

    const lvl = LEVELS[status?.level || 'unknown'];
    const ring = status?.ring || [];
    const tpsSeries = ring.map(r => r.tps).filter(v => v != null);
    const msptSeries = ring.map(r => r.mspt).filter(v => v != null);
    const msptMax = Math.max(100, Math.ceil(arrMax(msptSeries) / 50) * 50);

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: A.sans, color: A.text }}>

            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>Akıllı Performans Yönetimi</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                        Lag Koruması
                    </h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0, maxWidth: 640 }}>
                        Sunucu performansını canlı izler. Bu sürüm (Faz 0) yalnızca <strong>gözlem</strong> yapar —
                        otomatik kısıtlama veya ceza henüz uygulanmaz.
                    </p>
                </div>
                <Pill color="var(--accent)">FAZ 0 · İZLEME</Pill>
            </div>

            {/* KPI'lar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                <Card title="Durum" accent={lvl.color}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: lvl.color, fontFamily: A.mono, margin: '4px 0' }}>
                        {lvl.label}
                    </div>
                    <Cap style={{ display: 'block', marginTop: 6 }}>
                        {status?.running ? 'Sunucu çalışıyor, canlı izleniyor.' : 'Sunucu çalışmıyor.'}
                    </Cap>
                </Card>

                <KPI
                    label="TPS"
                    value={status?.tps != null ? status.tps.toFixed(1) : '—'}
                    spark={tpsSeries}
                    sparkMin={0}
                    sparkMax={20}
                    sparkColor={lvl.color}
                    sub="Hedef: 20.0"
                />

                <KPI
                    label="MSPT"
                    value={status?.mspt != null ? `${status.mspt.toFixed(1)} ms` : '—'}
                    spark={msptSeries}
                    sparkMin={0}
                    sparkMax={msptMax}
                    sparkColor={status?.mspt > 50 ? A.err : status?.mspt > 40 ? A.warn : A.ok}
                    sub="Hedef: < 50 ms"
                />

                <Card title="Can't Keep Up (5 dk)">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <Num size={24} color={status?.cantKeepUpCount > 0 ? A.err : A.text}>
                            {status?.cantKeepUpCount ?? 0}
                        </Num>
                        <span style={{ fontSize: 12, color: A.faint, fontFamily: A.mono }}>kez</span>
                    </div>
                    <Cap style={{ display: 'block', marginTop: 8 }}>
                        Konsolda yakalanan lag uyarısı · {status?.players ?? 0} oyuncu çevrimiçi
                    </Cap>
                </Card>
            </div>

            {/* Grafikler */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Card title={`TPS (son ${tpsSeries.length} örnek · ort ${avg(tpsSeries).toFixed(1)})`}>
                    <div style={{ marginTop: 8 }}>
                        {tpsSeries.length > 1
                            ? <AreaChart values={tpsSeries} min={0} max={20} stroke="#4ade80" fill="rgba(74,222,128,0.12)" height={150} gridY={4} />
                            : <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Veri bekleniyor…</div>}
                    </div>
                </Card>
                <Card title={`MSPT (ms · tepe ${arrMax(msptSeries).toFixed(0)})`}>
                    <div style={{ marginTop: 8 }}>
                        {msptSeries.length > 1
                            ? <AreaChart values={msptSeries} min={0} max={msptMax} stroke="#fb923c" fill="rgba(251,146,60,0.12)" height={150} gridY={4} />
                            : <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Veri bekleniyor…</div>}
                    </div>
                </Card>
            </div>

            {/* Observable probe */}
            <Card title="Observable Profiler — Teşhis (deneysel)">
                <p style={{ fontSize: 12, color: A.dim, margin: '0 0 12px' }}>
                    Sunucuda <code style={{ fontFamily: A.mono, color: A.warn }}>observable run N</code> komutunu çalıştırır
                    ve sonuç URL'sini yakalar. (Observable modunun kurulu olması gerekir.) Faz 2'de bu veri,
                    lag yapan mod/chunk'ı otomatik hedeflemek için kullanılacak.
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ width: 140 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Süre (saniye)</Cap>
                        <Input type="number" value={obsSeconds} onChange={e => setObsSeconds(Number(e.target.value))} min={5} max={120} />
                    </div>
                    <button
                        onClick={() => runObservable.mutate(obsSeconds)}
                        disabled={runObservable.isPending || status?.observableBusy || !status?.running}
                        style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: (runObservable.isPending || status?.observableBusy || !status?.running) ? 0.5 : 1 }}
                    >
                        <I.Signal size={13} /> {runObservable.isPending || status?.observableBusy ? 'Çalışıyor…' : 'Profili Çalıştır'}
                    </button>
                    {!status?.running && <span style={{ fontSize: 11, color: A.faint }}>Sunucu çalışmıyor.</span>}
                </div>

                {obsResult && (
                    <div style={{ marginTop: 14, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Pill color={obsResult.ok ? A.ok : A.err}>{obsResult.ok ? 'BAŞARILI' : 'URL YOK'}</Pill>
                            <span style={{ fontSize: 12, color: A.dim }}>{obsResult.note}</span>
                        </div>
                        {obsResult.url && (
                            <a href={obsResult.url} target="_blank" rel="noreferrer"
                               style={{ fontFamily: A.mono, fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>
                                {obsResult.url}
                            </a>
                        )}
                        {Array.isArray(obsResult.lines) && obsResult.lines.length > 0 && (
                            <div style={{ marginTop: 8, fontFamily: A.mono, fontSize: 11, color: A.faint, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {obsResult.lines.slice(-6).map((l, i) => <div key={i} style={{ wordBreak: 'break-all' }}>{l}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </Card>

        </div>
    );
}
