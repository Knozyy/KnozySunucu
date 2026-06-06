import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Num, Pill, Card, KPI, Input, Toggle } from '@/hoodoo/primitives';
import { AreaChart, avg, max as arrMax } from '@/hoodoo/charts';
import { I } from '@/hoodoo/icons';

const LEVELS = {
    unknown:  { color: '#5f6368', label: 'VERİ YOK' },
    stable:   { color: '#4ade80', label: 'STABİL' },
    minor:    { color: '#fbbf24', label: 'SINIRDA' },
    warn:     { color: '#fb923c', label: 'LAG' },
    critical: { color: '#f87171', label: 'AĞIR LAG' },
};

const MODES = [
    { id: 'off',    label: 'Kapalı',          color: '#5f6368', desc: 'Sistem hiçbir şey yapmaz, yalnızca izler.' },
    { id: 'dryrun', label: 'Öner (dry-run)',  color: '#a78bfa', desc: 'Ne yapacağını loglar ama UYGULAMAZ. Güvenli test modu.' },
    { id: 'auto',   label: 'Otomatik',        color: '#4ade80', desc: 'Lag\'de kaldıraçları gerçekten kısar, stabilde kademeli açar.' },
];

const STATE_LABEL = {
    idle: 'PASİF', normal: 'NORMAL', throttling: 'KISILIYOR', cooldown: 'BEKLEME', recovering: 'AÇILIYOR',
};

const EMPTY_LEVER = {
    name: '', lever_key: '', apply_method: 'gamerule', apply_template: '',
    value_type: 'int', default_value: 3, relief_value: 0, step: 1, priority: 50, description: '',
};

export default function LagGuardPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('genel');
    const [obsSeconds, setObsSeconds] = useState(20);
    const [obsResult, setObsResult] = useState(null);
    const [editing, setEditing] = useState(null); // lever object or EMPTY_LEVER for new
    const [histAction, setHistAction] = useState('all'); // all | throttle | recover | reset
    const [histSearch, setHistSearch] = useState('');

    const { data: status } = useQuery({
        queryKey: ['lagguard-status'],
        queryFn: () => api.get('/lag-guard/status').then(r => r.data),
        refetchInterval: 2500,
    });
    const { data: leversData } = useQuery({
        queryKey: ['lagguard-levers'],
        queryFn: () => api.get('/lag-guard/levers').then(r => r.data),
    });
    const { data: historyData } = useQuery({
        queryKey: ['lagguard-history'],
        queryFn: () => api.get('/lag-guard/history?limit=80').then(r => r.data),
        refetchInterval: 8000,
    });
    const { data: settingsData } = useQuery({
        queryKey: ['lagguard-settings'],
        queryFn: () => api.get('/lag-guard/settings').then(r => r.data),
    });
    const { data: queueData } = useQuery({
        queryKey: ['lagguard-queue'],
        queryFn: () => api.get('/lag-guard/restart-queue').then(r => r.data),
        refetchInterval: 5000,
    });
    const { data: attrData } = useQuery({
        queryKey: ['lagguard-attribution'],
        queryFn: () => api.get('/lag-guard/attribution?limit=40').then(r => r.data),
        refetchInterval: 10000,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['lagguard-status'] });
        qc.invalidateQueries({ queryKey: ['lagguard-levers'] });
        qc.invalidateQueries({ queryKey: ['lagguard-history'] });
        qc.invalidateQueries({ queryKey: ['lagguard-queue'] });
    };

    const setMode = useMutation({
        mutationFn: (mode) => api.put('/lag-guard/mode', { mode }),
        onSuccess: (r) => { invalidate(); toast.success(`Mod: ${r.data.mode}`); },
        onError: (e) => toast.error(e.response?.data?.error || 'Mod değiştirilemedi'),
    });
    const seed = useMutation({
        mutationFn: () => api.post('/lag-guard/levers/seed'),
        onSuccess: () => { invalidate(); toast.success('Başlangıç kütüphanesi yüklendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Yüklenemedi'),
    });
    const resetAll = useMutation({
        mutationFn: () => api.post('/lag-guard/reset'),
        onSuccess: (r) => { invalidate(); toast.success(r.data.message); },
        onError: (e) => toast.error(e.response?.data?.error || 'Sıfırlanamadı'),
    });
    const toggleLever = useMutation({
        mutationFn: (id) => api.post(`/lag-guard/levers/${id}/toggle`),
        onSuccess: () => invalidate(),
        onError: (e) => toast.error(e.response?.data?.error || 'Değiştirilemedi'),
    });
    const deleteLever = useMutation({
        mutationFn: (id) => api.delete(`/lag-guard/levers/${id}`),
        onSuccess: () => { invalidate(); toast.success('Silindi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });
    const applyLever = useMutation({
        mutationFn: (id) => api.post(`/lag-guard/levers/${id}/apply`).then(r => r.data),
        onSuccess: (d) => {
            invalidate();
            if (d.applied) toast.success(`Uygulandı → ${d.detail}`, { duration: 6000 });
            else toast.error(d.detail || (d.skipped ? 'Atlandı' : 'Uygulanamadı'), { duration: 7000 });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Uygulanamadı'),
    });
    const saveLever = useMutation({
        mutationFn: (l) => l.id ? api.put(`/lag-guard/levers/${l.id}`, l) : api.post('/lag-guard/levers', l),
        onSuccess: () => { invalidate(); setEditing(null); toast.success('Kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const bulkAdd = useMutation({
        mutationFn: (items) => api.post('/lag-guard/levers/bulk', { levers: items }),
        onSuccess: (r) => { invalidate(); setEditing(null); toast.success(r.data.message); },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });
    const runObservable = useMutation({
        mutationFn: (s) => api.post('/lag-guard/observable/run', { seconds: s }).then(r => r.data),
        onMutate: () => { setObsResult(null); toast.loading('Observable çalışıyor…', { id: 'obs' }); },
        onSuccess: (d) => { setObsResult(d); toast.dismiss('obs'); d.ok ? toast.success('Sonuç yakalandı') : toast.error(d.note || 'URL yok'); },
        onError: (e) => { toast.dismiss('obs'); toast.error(e.response?.data?.error || 'Çalıştırılamadı'); },
    });
    const saveSettings = useMutation({
        mutationFn: (patch) => api.put('/lag-guard/settings', patch).then(r => r.data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['lagguard-settings'] }); toast.success('Ayarlar kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const applyQueue = useMutation({
        mutationFn: () => api.post('/lag-guard/restart-queue/apply').then(r => r.data),
        onSuccess: (d) => { invalidate(); toast.success(`Kuyruk yazıldı: ${d.applied} config, ${d.errors} hata (etki sonraki restart'ta)`, { duration: 6000 }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Uygulanamadı'),
    });
    const applyQueueRestart = useMutation({
        mutationFn: () => api.post('/lag-guard/restart-queue/apply-restart').then(r => r.data),
        onSuccess: (d) => { invalidate(); toast.success(`${d.applied} config yazıldı${d.restarted ? ' + sunucu yeniden başlatılıyor' : ''}`, { duration: 6000 }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Uygulanamadı'),
    });
    const clearQueue = useMutation({
        mutationFn: () => api.delete('/lag-guard/restart-queue').then(r => r.data),
        onSuccess: () => { invalidate(); toast.success('Kuyruk temizlendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Temizlenemedi'),
    });
    const cancelQueueItem = useMutation({
        mutationFn: (id) => api.delete(`/lag-guard/restart-queue/${id}`).then(r => r.data),
        onSuccess: () => invalidate(),
        onError: (e) => toast.error(e.response?.data?.error || 'İptal edilemedi'),
    });
    const runScan = useMutation({
        mutationFn: () => api.post('/lag-guard/attribution/scan').then(r => r.data),
        onSuccess: (d) => {
            if (d.started) {
                toast.success('Observable profili çalışıyor (~25sn)… bitince listeye düşer', { duration: 8000 });
                // Sonuç ~25sn sonra gelir; birkaç kez yenile
                [8000, 16000, 24000, 30000].forEach(ms => setTimeout(() => qc.invalidateQueries({ queryKey: ['lagguard-attribution'] }), ms));
            } else {
                toast(d.note || 'Zaten çalışıyor');
            }
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Tarama başlatılamadı'),
    });
    const clearAttr = useMutation({
        mutationFn: () => api.delete('/lag-guard/attribution').then(r => r.data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['lagguard-attribution'] }); toast.success('Shadow log temizlendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Temizlenemedi'),
    });

    const lvl = LEVELS[status?.level || 'unknown'];
    const mode = status?.mode || 'off';
    const ring = status?.ring || [];
    const tpsSeries = ring.map(r => r.tps).filter(v => v != null);
    const msptSeries = ring.map(r => r.mspt).filter(v => v != null);
    const msptMax = Math.max(100, Math.ceil(arrMax(msptSeries) / 50) * 50);
    const levers = leversData?.levers || [];
    const dec = status?.decision || {};
    const decLog = dec.log || [];
    const history = historyData?.history || [];
    const settings = settingsData?.settings || null;
    const queue = queueData?.queue || [];
    const attrLog = attrData?.log || [];
    const filteredHistory = history.filter(h =>
        (histAction === 'all' || h.action === histAction) &&
        (!histSearch || (h.lever_key || '').toLowerCase().includes(histSearch.toLowerCase()))
    );
    const exportHistoryCsv = () => {
        const cols = ['created_at', 'lever_key', 'action', 'mode', 'old_value', 'new_value', 'mspt_at'];
        const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const rows = filteredHistory.map(h => cols.map(c => esc(h[c])).join(','));
        const csv = [cols.join(','), ...rows].join('\n');
        // BOM (U+FEFF) — Excel'in Türkçe karakterleri UTF-8 olarak doğru açması için
        const bom = String.fromCharCode(0xFEFF);
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lag-guard-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: A.sans, color: A.text }}>

            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>Akıllı Performans Yönetimi</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 2px' }}>Lag Koruması</h1>
                    <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, marginTop: 4 }}>
                        TPS kaynağı:{' '}
                        {status?.tpsCommand
                            ? <span style={{ color: A.ok }}>/{status.tpsCommand}</span>
                            : status?.tpsCommandSearching ? <span style={{ color: A.warn }}>algılanıyor…</span> : '—'}
                        {' · '}durum: <span style={{ color: lvl.color }}>{STATE_LABEL[dec.state] || '—'}</span>
                    </div>
                </div>
                <Pill color={MODES.find(m => m.id === mode)?.color}>MOD: {MODES.find(m => m.id === mode)?.label?.toUpperCase()}</Pill>
            </div>

            {/* Mod kontrolü */}
            <Card title="Çalışma Modu">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {MODES.map(m => (
                        <button key={m.id}
                            onClick={() => {
                                if (m.id === 'auto' && !confirm('Otomatik mod: sistem mod config/komutlarını GERÇEKTEN değiştirecek. Emin misin?')) return;
                                setMode.mutate(m.id);
                            }}
                            style={{
                                ...(mode === m.id ? btnPrimary : btnGhost),
                                borderColor: mode === m.id ? m.color : A.border,
                                background: mode === m.id ? `${m.color}22` : 'transparent',
                                color: mode === m.id ? m.color : A.dim,
                                minWidth: 130,
                            }}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <p style={{ fontSize: 12, color: A.dim, margin: '10px 0 0' }}>
                    {MODES.find(m => m.id === mode)?.desc}
                    {mode === 'off' && ' — Kaldıraçlar şu anki değerlerinde kalır; default\'a döndürmek için "Tümünü Sıfırla".'}
                </p>
            </Card>

            {/* KPI'lar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                <Card title="Durum" accent={lvl.color}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: lvl.color, fontFamily: A.mono, margin: '4px 0' }}>{lvl.label}</div>
                    <Cap style={{ display: 'block', marginTop: 6 }}>{status?.running ? 'Sunucu çalışıyor' : 'Sunucu kapalı'}</Cap>
                </Card>
                <KPI label="TPS" value={status?.tps != null ? status.tps.toFixed(1) : '—'} spark={tpsSeries} sparkMin={0} sparkMax={20} sparkColor={lvl.color} sub="Hedef 20.0" />
                <KPI label="MSPT" value={status?.mspt != null ? `${status.mspt.toFixed(1)} ms` : '—'} spark={msptSeries} sparkMin={0} sparkMax={msptMax} sparkColor={status?.mspt > 50 ? A.err : A.ok} sub="Hedef < 50 ms" />
                <Card title="Kaldıraçlar">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <Num size={24} color={status?.throttledCount > 0 ? A.warn : A.text}>{status?.throttledCount ?? 0}</Num>
                        <span style={{ fontSize: 12, color: A.faint, fontFamily: A.mono }}>/ {status?.leverCount ?? 0} kısık</span>
                    </div>
                    <Cap style={{ display: 'block', marginTop: 8 }}>Can't Keep Up (5dk): {status?.cantKeepUpCount ?? 0}</Cap>
                </Card>
            </div>

            {/* Sekmeler */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${A.border}`, gap: 4 }}>
                {[{ id: 'genel', label: 'Genel', icon: I.Signal }, { id: 'levers', label: 'Kaldıraçlar', icon: I.Wrench }, { id: 'atif', label: 'Atıf', icon: I.Users }, { id: 'log', label: 'Aksiyon Logu', icon: I.Clock }, { id: 'ayarlar', label: 'Ayarlar', icon: I.Cog }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        background: 'transparent', border: 'none',
                        borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                        color: tab === t.id ? '#fff' : A.dim, fontSize: 12, fontWeight: 500,
                        padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <t.icon size={14} style={{ color: tab === t.id ? 'var(--accent)' : A.faint }} /> {t.label}
                        {t.id === 'ayarlar' && queue.length > 0 && (
                            <span style={{
                                fontSize: 10, fontFamily: A.mono, fontWeight: 700, color: A.bg,
                                background: A.warn, borderRadius: 9, padding: '1px 6px', lineHeight: 1.5,
                            }}>{queue.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* GENEL */}
            {tab === 'genel' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Card title={`TPS (ort ${avg(tpsSeries).toFixed(1)})`}>
                            <div style={{ marginTop: 8 }}>{tpsSeries.length > 1 ? <AreaChart values={tpsSeries} min={0} max={20} stroke="#4ade80" fill="rgba(74,222,128,0.12)" height={150} /> : <Empty />}</div>
                        </Card>
                        <Card title={`MSPT (tepe ${arrMax(msptSeries).toFixed(0)}ms)`}>
                            <div style={{ marginTop: 8 }}>{msptSeries.length > 1 ? <AreaChart values={msptSeries} min={0} max={msptMax} stroke="#fb923c" fill="rgba(251,146,60,0.12)" height={150} /> : <Empty />}</div>
                        </Card>
                    </div>
                    <Card title="Observable Profiler — Teşhis (deneysel)">
                        <p style={{ fontSize: 12, color: A.dim, margin: '0 0 12px' }}>
                            <code style={{ fontFamily: A.mono, color: A.warn }}>observable run N</code> çalıştırır, sonuç URL'sini yakalar.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                            <div style={{ width: 120 }}><Cap style={{ display: 'block', marginBottom: 4 }}>Süre (sn)</Cap>
                                <Input type="number" value={obsSeconds} onChange={e => setObsSeconds(Number(e.target.value))} min={5} max={120} /></div>
                            <button onClick={() => runObservable.mutate(obsSeconds)} disabled={runObservable.isPending || status?.observableBusy || !status?.running}
                                style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: (runObservable.isPending || status?.observableBusy || !status?.running) ? 0.5 : 1 }}>
                                <I.Signal size={13} /> {runObservable.isPending || status?.observableBusy ? 'Çalışıyor…' : 'Profili Çalıştır'}
                            </button>
                        </div>
                        {obsResult && (
                            <div style={{ marginTop: 14, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 12 }}>
                                <Pill color={obsResult.ok ? A.ok : A.err}>{obsResult.ok ? 'BAŞARILI' : 'URL YOK'}</Pill>
                                {obsResult.url && <a href={obsResult.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, fontFamily: A.mono, fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>{obsResult.url}</a>}
                            </div>
                        )}
                    </Card>
                </>
            )}

            {/* KALDIRAÇLAR */}
            {tab === 'levers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => setEditing({ ...EMPTY_LEVER })} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}><I.Plus size={13} /> Kaldıraç Ekle</button>
                        <button onClick={() => seed.mutate()} style={btnGhost}>Başlangıç Kütüphanesini Yükle</button>
                        <button onClick={() => { if (confirm('Tüm kaldıraçları default değerlerine döndür?')) resetAll.mutate(); }} style={{ ...btnGhost, color: A.warn }}><I.Restart size={12} /> Tümünü Sıfırla</button>
                    </div>
                    <p style={{ fontSize: 11, color: A.faint, margin: 0 }}>
                        Otomatik uygulama yalnızca <strong style={{ color: A.dim }}>Otomatik</strong> modda + lag anında olur. Bir kaldıracı hemen test etmek için <strong style={{ color: 'var(--accent)' }}>Uygula</strong> butonunu kullan — moddan bağımsız dosyayı/komutu gerçekten uygular ve sonucu/hatayı gösterir.
                    </p>

                    {levers.length === 0 ? <Empty text="Kaldıraç yok. 'Başlangıç Kütüphanesini Yükle' ile başla." /> : levers.map(l => {
                        const cur = l.current_value != null ? l.current_value : l.default_value;
                        const throttled = cur !== l.default_value;
                        const span = (l.relief_value ?? l.default_value) - l.default_value;
                        const pct = span !== 0 ? Math.abs((cur - l.default_value) / span) * 100 : 0;
                        const dirTxt = span < 0 ? 'azalt' : span > 0 ? 'artır' : '—';
                        return (
                            <div key={l.id} style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600 }}>{l.name}</span>
                                        <Pill color={l.enabled ? A.ok : A.faint}>{l.enabled ? 'AKTİF' : 'KAPALI'}</Pill>
                                        <Pill color="var(--accent)">{l.apply_method}</Pill>
                                        <Pill color={A.faint}>öncelik {l.priority}</Pill>
                                        {l.apply_method === 'config_restart' ? <Pill color={A.warn}>restart kuyruğu</Pill> : null}
                                        {l.effect_samples > 0 && l.effect_score != null ? (
                                            <Pill color={l.effect_score > 0.2 ? A.ok : l.effect_score < -0.2 ? A.err : A.faint}>
                                                etki {l.effect_score > 0 ? '−' : '+'}{Math.abs(l.effect_score).toFixed(1)}ms/adım
                                            </Pill>
                                        ) : null}
                                        {l.is_builtin ? <Pill color={A.faint}>yerleşik</Pill> : null}
                                    </div>
                                    {l.description ? <p style={{ fontSize: 11, color: A.dim, margin: '6px 0 0' }}>{l.description}</p> : null}
                                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontFamily: A.mono, fontSize: 12, color: throttled ? A.warn : A.ok, fontWeight: 600 }}>{cur}</span>
                                        <div style={{ flex: 1, maxWidth: 220, height: 5, background: A.bg, borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: throttled ? A.warn : A.ok }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>normal {l.default_value} → relief {l.relief_value} ({dirTxt}){l.lag_ceiling != null ? ` · tavan ${l.lag_ceiling}` : ''}</span>
                                    </div>
                                    {l.apply_template ? <code style={{ display: 'block', marginTop: 6, fontSize: 10, color: A.faint, fontFamily: A.mono }}>{l.apply_template}</code> : null}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                    <Toggle value={!!l.enabled} onChange={() => toggleLever.mutate(l.id)} />
                                    <button onClick={() => applyLever.mutate(l.id)} disabled={applyLever.isPending} style={{ ...btnGhost, color: 'var(--accent)' }} title="relief değerini şimdi gerçekten uygula (test)">Uygula</button>
                                    <button onClick={() => setEditing(l)} style={btnGhost}>Düzenle</button>
                                    <button onClick={() => { if (confirm(`"${l.name}" silinsin mi?`)) deleteLever.mutate(l.id); }} style={{ ...btnGhost, color: A.err }}>Sil</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* LOG */}
            {tab === 'log' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Card title="Karar Motoru — Canlı Log">
                        <div style={{ maxHeight: 220, overflowY: 'auto', fontFamily: A.mono, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {decLog.length === 0 ? <span style={{ color: A.faint }}>Henüz aksiyon yok.</span> : decLog.slice().reverse().map((e, i) => (
                                <div key={i}><span style={{ color: A.faint }}>[{new Date(e.time).toLocaleTimeString('tr-TR')}]</span>{' '}
                                    <span style={{ color: e.level === 'throttle' ? A.warn : e.level === 'recover' ? A.ok : e.level === 'error' ? A.err : A.dim }}>{e.message}</span></div>
                            ))}
                        </div>
                    </Card>
                    <Card title="Kaldıraç Değişiklik Geçmişi" action={
                        <button onClick={exportHistoryCsv} disabled={filteredHistory.length === 0}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6, opacity: filteredHistory.length === 0 ? 0.4 : 1 }}>
                            <I.Download size={12} /> CSV
                        </button>
                    }>
                        {/* Filtre çubuğu */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[{ id: 'all', label: 'Tümü' }, { id: 'throttle', label: 'Kıs' }, { id: 'recover', label: 'Aç' }, { id: 'reset', label: 'Sıfırla' }].map(o => (
                                    <button key={o.id} onClick={() => setHistAction(o.id)} style={{
                                        ...btnGhost, padding: '5px 10px', fontSize: 11,
                                        borderColor: histAction === o.id ? 'var(--accent)' : A.border,
                                        color: histAction === o.id ? '#fff' : A.dim,
                                    }}>{o.label}</button>
                                ))}
                            </div>
                            <div style={{ flex: 1, minWidth: 160, maxWidth: 260 }}>
                                <Input mono value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="kaldıraç ara…" />
                            </div>
                            <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>{filteredHistory.length} / {history.length}</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead><tr style={{ borderBottom: `1px solid ${A.border}` }}>
                                    {['Zaman', 'Kaldıraç', 'Aksiyon', 'Mod', 'Eski', 'Yeni', 'MSPT'].map(h => <th key={h} style={{ padding: '6px 10px' }}><Cap>{h}</Cap></th>)}
                                </tr></thead>
                                <tbody>
                                    {filteredHistory.length === 0 ? <tr><td colSpan={7} style={{ padding: 16, color: A.faint, textAlign: 'center' }}>{history.length === 0 ? 'Kayıt yok.' : 'Filtreye uyan kayıt yok.'}</td></tr> :
                                        filteredHistory.map(h => (
                                            <tr key={h.id} style={{ borderBottom: `1px solid ${A.border}` }}>
                                                <td style={{ padding: '8px 10px', fontFamily: A.mono, color: A.dim }}>{new Date(h.created_at).toLocaleString('tr-TR')}</td>
                                                <td style={{ padding: '8px 10px' }}>{h.lever_key}</td>
                                                <td style={{ padding: '8px 10px' }}><Pill color={h.action === 'throttle' ? A.warn : h.action === 'recover' ? A.ok : A.faint}>{h.action}</Pill></td>
                                                <td style={{ padding: '8px 10px', color: A.faint }}>{h.mode}</td>
                                                <td style={{ padding: '8px 10px', fontFamily: A.mono }}>{h.old_value}</td>
                                                <td style={{ padding: '8px 10px', fontFamily: A.mono, color: h.action === 'throttle' ? A.warn : A.ok }}>{h.new_value}</td>
                                                <td style={{ padding: '8px 10px', fontFamily: A.mono, color: A.faint }}>{h.mspt_at != null ? Math.round(h.mspt_at) : '—'}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ATIF / SHADOW LOG */}
            {tab === 'atif' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Card title="Lag Atıf — Shadow Log"
                        action={
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => runScan.mutate()} disabled={runScan.isPending || status?.attributionBusy || !status?.running}
                                    style={{ ...btnGhost, color: 'var(--accent)', opacity: (runScan.isPending || status?.attributionBusy || !status?.running) ? 0.5 : 1 }}
                                    title="Observable profili çalıştırıp lag'i sahiplere dağıtır (~25sn)">
                                    {status?.attributionBusy ? 'Profilleniyor…' : 'Tara (Observable)'}
                                </button>
                                {attrLog.length > 0 && <button onClick={() => { if (confirm('Tüm shadow log silinsin mi?')) clearAttr.mutate(); }} style={{ ...btnGhost, color: A.err }}>Temizle</button>}
                            </div>
                        }>
                        <p style={{ fontSize: 11, color: A.faint, margin: 0 }}>
                            <strong style={{ color: A.dim }}>Observable</strong> profili çalıştırılır; her laggy entity/block'un koordinatı + maliyeti (ms/tick)
                            <strong style={{ color: A.dim }}> FTB Chunks claim sahibine</strong> dağıtılır → <strong style={{ color: A.dim }}>sahip başına TPS payı</strong>.
                            <strong style={{ color: A.warn }}> Ceza uygulanmaz</strong> — yalnızca kayıt. Kritik lag'de 10dk'da bir otomatik.
                        </p>
                    </Card>

                    {attrLog.length === 0
                        ? <Empty text="Henüz atıf kaydı yok. Lag anında otomatik dolar ya da 'Tara' ile elle çalıştır." />
                        : attrLog.map(a => <AttributionCard key={a.id} entry={a} />)}
                </div>
            )}

            {/* AYARLAR */}
            {tab === 'ayarlar' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Restart-config kuyruğu (Faz 2) */}
                    <Card title={`Restart-Config Kuyruğu · ${queue.length}`} accent={queue.length ? A.warn : A.faint}
                        action={queue.length > 0 && (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => applyQueue.mutate()} disabled={applyQueue.isPending}
                                    style={{ ...btnGhost, color: 'var(--accent)' }} title="Config dosyalarına yaz (etki sonraki restart'ta)">
                                    <I.Check size={12} /> Uygula
                                </button>
                                <button onClick={() => { if (confirm('Bekleyen config değişiklikleri yazılıp sunucu YENİDEN BAŞLATILACAK. Emin misin?')) applyQueueRestart.mutate(); }}
                                    disabled={applyQueueRestart.isPending}
                                    style={{ ...btnGhost, color: A.warn }} title="Yaz + sunucuyu yeniden başlat">
                                    <I.Restart size={12} /> Uygula + Restart
                                </button>
                                <button onClick={() => { if (confirm('Kuyruktaki tüm bekleyenler iptal edilsin mi?')) clearQueue.mutate(); }}
                                    style={{ ...btnGhost, color: A.err }}>Temizle</button>
                            </div>
                        )}>
                        <p style={{ fontSize: 11, color: A.faint, margin: '0 0 10px' }}>
                            <code style={{ fontFamily: A.mono, color: A.warn }}>config_restart</code> kaldıraçları canlı uygulanamaz;
                            LagGuard istenen değeri buraya yazar. <strong style={{ color: A.dim }}>Uygula</strong> config dosyalarına yazar
                            (etki sonraki restart'ta), <strong style={{ color: A.dim }}>Uygula + Restart</strong> hemen yeniden başlatır.
                        </p>
                        {queue.length === 0
                            ? <div style={{ color: A.faint, fontSize: 12, padding: '12px 0', textAlign: 'center' }}>Bekleyen değişiklik yok.</div>
                            : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {queue.map(q => (
                                        <div key={q.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                                            background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: '8px 12px',
                                        }}>
                                            <div style={{ minWidth: 0 }}>
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{q.lever_name || q.lever_key}</span>
                                                <code style={{ display: 'block', marginTop: 3, fontSize: 10.5, color: A.faint, fontFamily: A.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {q.config_path}:{q.config_key} = {q.target_value}{q.reason ? ` · ${q.reason}` : ''}
                                                </code>
                                            </div>
                                            <button onClick={() => cancelQueueItem.mutate(q.id)} style={{ ...btnGhost, color: A.err, flexShrink: 0 }}>İptal</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </Card>

                    {settings
                        ? <SettingsPanel key={JSON.stringify(settings)} initial={settings} onSave={(patch) => saveSettings.mutate(patch)} saving={saveSettings.isPending} />
                        : <Empty text="Ayarlar yükleniyor…" />}
                </div>
            )}

            {/* Kaldıraç ekle/düzenle modal */}
            {editing && <LeverModal lever={editing} onClose={() => setEditing(null)} onSave={(l) => saveLever.mutate(l)} onBulk={(items) => bulkAdd.mutate(items)} saving={saveLever.isPending || bulkAdd.isPending} />}
        </div>
    );
}

function Empty({ text = 'Veri bekleniyor…' }) {
    return <div style={{ color: A.faint, fontSize: 12, padding: '36px 0', textAlign: 'center' }}>{text}</div>;
}

function AttributionCard({ entry }) {
    const ev = entry.evidence || {};
    const owners = ev.owners || [];
    const top = ev.top || [];
    const types = ev.types || [];
    const errNotes = (ev.notes || []).filter(Boolean);
    const modeColor = entry.mode === 'auto' ? A.ok : entry.mode === 'manual' ? 'var(--accent)' : A.warn;
    const failed = ev.ok === false;
    return (
        <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>{new Date(entry.ts).toLocaleString('tr-TR')}</span>
                <Pill color={modeColor}>{entry.mode}</Pill>
                {entry.mspt_at != null ? <Pill color={A.faint}>MSPT {Math.round(entry.mspt_at)}</Pill> : null}
                {!failed && ev.totalMs != null ? <Pill color={ev.totalMs > 25 ? A.err : A.warn}>profil {ev.totalMs}ms/tick</Pill> : null}
                {!failed ? <Pill color={owners.length ? 'var(--accent)' : A.faint}>{owners.length} sahip</Pill> : <Pill color={A.err}>başarısız</Pill>}
                {ev.ftb?.parsed ? <Pill color={A.ok}>FTB {ev.ftb.parsed} claim</Pill> : null}
                {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: A.mono, color: 'var(--accent)' }}>↗ Observable</a> : null}
            </div>

            {/* Sahip başına TPS payı */}
            {owners.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <Cap>Sahip başına TPS payı</Cap>
                    <div style={{ marginTop: 4 }}>
                        {owners.slice(0, 12).map((o, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 3fr 0.9fr', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: i !== Math.min(owners.length, 12) - 1 ? `1px solid ${A.border}` : 'none' }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: /claimsiz/.test(o.owner) ? A.faint : A.text }}>{o.owner}</span>
                                <div style={{ height: 6, background: A.bg, borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, o.pct)}%`, height: '100%', background: o.pct > 25 ? A.err : o.pct > 10 ? A.warn : 'var(--accent)' }} />
                                </div>
                                <span style={{ fontFamily: A.mono, fontSize: 12, textAlign: 'right', color: o.pct > 25 ? A.err : A.text }}>%{o.pct} · {o.ms}ms</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* En pahalı koordinatlar */}
            {top.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <Cap>En pahalı koordinatlar</Cap>
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {top.slice(0, 8).map((h, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: A.mono, color: h.ms > 0.5 ? A.err : A.text, minWidth: 64 }}>{h.ms}ms</span>
                                <span style={{ color: A.faint }}>{h.kind}</span>
                                <span style={{ color: A.dim }}>{h.type}</span>
                                <code style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>{h.dim?.replace('minecraft:', '')} {h.pos?.join(' ')}</code>
                                {h.owner ? <span style={{ color: 'var(--accent)', fontSize: 11 }}>→ {h.owner}</span> : <span style={{ color: A.faint, fontSize: 10 }}>→ claimsiz</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* En pahalı türler */}
            {types.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <Cap>En pahalı türler</Cap>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {types.slice(0, 8).map((t, i) => (
                            <span key={i} style={{ fontSize: 11, fontFamily: A.mono, color: A.dim, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 3, padding: '2px 6px' }}>
                                {t.type.replace('minecraft:', '')} <strong style={{ color: t.pct > 15 ? A.err : A.text }}>%{t.pct}</strong>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {errNotes.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: failed ? A.err : A.faint, fontFamily: A.mono }}>
                    {errNotes.map((n, i) => <div key={i}>· {n}</div>)}
                </div>
            )}
        </div>
    );
}

const SETTINGS_GROUPS = [
    {
        title: 'Karar Eşikleri — MSPT (birincil sinyal, ms)',
        hint: 'Sunucu bir tick\'i bu süreden uzun işlerse lag sayılır. Karar bu değerlere göre verilir.',
        fields: [
            { k: 'msptTarget', label: 'Hedef (≤ → stabil)' },
            { k: 'msptWarn', label: 'Uyarı (≥ → kıs)' },
            { k: 'msptCritical', label: 'Kritik (≥ → agresif kıs)' },
            { k: 'cantKeepUpCritical', label: '"Can\'t keep up" / 5dk → kritik' },
        ],
    },
    {
        title: 'Görüntüleme Eşikleri — TPS',
        hint: 'Yalnızca durum etiketi/rengi için. Karar MSPT ile verilir.',
        fields: [
            { k: 'tpsTarget', label: 'Hedef' },
            { k: 'tpsWarn', label: 'Uyarı' },
            { k: 'tpsCritical', label: 'Kritik' },
        ],
    },
    {
        title: 'Zamanlama (saniye)',
        fields: [
            { k: 'checkInterval', label: 'Karar aralığı' },
            { k: 'cooldownAfterThrottle', label: 'Kısma sonrası bekleme' },
            { k: 'cooldownAfterRecovery', label: 'Açma sonrası bekleme' },
            { k: 'stableForRecovery', label: 'Açmadan önce stabil kalma' },
            { k: 'observableSeconds', label: 'Observable profil süresi' },
        ],
    },
];

function SettingsPanel({ initial, onSave, saving }) {
    const [form, setForm] = useState(() => ({ ...initial }));
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const allowRestart = Number(form.allowRestartLevers) === 1;

    const dirty = Object.keys(form).some(k => String(form[k]) !== String(initial[k]));

    const save = () => {
        // Yalnızca değişen alanları gönder (backend zaten süzüyor ama temiz kalsın)
        const patch = {};
        for (const k of Object.keys(form)) {
            if (String(form[k]) !== String(initial[k])) patch[k] = Number(form[k]);
        }
        if (Object.keys(patch).length === 0) { toast('Değişiklik yok'); return; }
        onSave(patch);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Restart kaldıraçları — en kritik ayar */}
            <Card title="Restart Gerektiren Kaldıraçlar" accent={allowRestart ? A.warn : A.faint}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0, maxWidth: 560 }}>
                        <code style={{ fontFamily: A.mono, color: A.warn }}>config_restart</code> yöntemli kaldıraçlar yalnızca
                        sonraki yeniden başlatmada etkin olur. Açık değilken bu kaldıraçlar
                        otomatik karar motorunda <strong style={{ color: A.dim }}>atlanır</strong>.
                        Sadece dosyayı değiştirip restart'ta etki etmesini istiyorsan aç.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11, color: allowRestart ? A.warn : A.faint, fontFamily: A.mono }}>{allowRestart ? 'AÇIK' : 'KAPALI'}</span>
                        <Toggle value={allowRestart} onChange={(v) => set('allowRestartLevers', v ? 1 : 0)} />
                    </div>
                </div>
            </Card>

            {SETTINGS_GROUPS.map(g => (
                <Card key={g.title} title={g.title}>
                    {g.hint && <p style={{ fontSize: 11, color: A.faint, margin: '0 0 12px' }}>{g.hint}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                        {g.fields.map(f => (
                            <div key={f.k}>
                                <Cap style={{ display: 'block', marginBottom: 4 }}>{f.label}</Cap>
                                <Input type="number" mono value={form[f.k] ?? ''} onChange={e => set(f.k, e.target.value)} />
                            </div>
                        ))}
                    </div>
                </Card>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={save} disabled={saving || !dirty}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: (saving || !dirty) ? 0.5 : 1 }}>
                    <I.Check size={13} /> {saving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
                </button>
                {dirty && <span style={{ fontSize: 11, color: A.warn, fontFamily: A.mono }}>kaydedilmemiş değişiklik var</span>}
            </div>
        </div>
    );
}

function LeverModal({ lever, onClose, onSave, onBulk, saving }) {
    const [f, setF] = useState(lever);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const isConfig = f.apply_method === 'config_reload' || f.apply_method === 'config_restart';

    // ── Config gezgini ──
    const [cfgPath, setCfgPath] = useState(f.config_path || '');
    const [cfgSearch, setCfgSearch] = useState('');
    const [fileSearch, setFileSearch] = useState('');
    const { data: filesData } = useQuery({
        queryKey: ['lg-cfg-files'],
        queryFn: () => api.get('/lag-guard/config/files').then(r => r.data),
        enabled: isConfig,
    });
    const files = filesData?.files || [];
    const cfgFmt = files.find(x => x.path === cfgPath)?.format;
    const { data: entriesData, isFetching: cfgLoading, error: cfgErr } = useQuery({
        queryKey: ['lg-cfg-read', cfgPath],
        queryFn: () => api.get('/lag-guard/config/read', { params: { path: cfgPath } }).then(r => r.data),
        enabled: isConfig && !!cfgPath,
        retry: false,
    });
    const cfgEntries = (entriesData?.entries || []).filter(e => e.key.toLowerCase().includes(cfgSearch.toLowerCase()));
    const pickEntry = (e) => {
        setF(p => ({
            ...p,
            config_path: cfgPath, config_format: cfgFmt || 'toml', config_key: e.key,
            default_value: e.value,
            relief_value: e.type === 'boolean' ? 0 : e.value, // relief'i sen ayarla (lag'de gidilecek değer)
            step: 1,
            value_type: Number.isInteger(e.value) ? 'int' : 'float',
            name: p.name || e.key.split('.').pop(),
            lever_key: p.lever_key || e.key.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40),
        }));
    };

    // Çoklu seçim + toplu ekleme
    const [sel, setSel] = useState({});
    const [bulkDir, setBulkDir] = useState('down');
    const [bulkPct, setBulkPct] = useState(50);
    const [bulkStep, setBulkStep] = useState(1);
    const [bulkPrio, setBulkPrio] = useState(50);
    const selCount = Object.keys(sel).length;
    const toggleSel = (e) => setSel(p => { const n = { ...p }; if (n[e.key]) delete n[e.key]; else n[e.key] = e; return n; });
    const doBulk = () => {
        const items = Object.values(sel).map(e => {
            const v = e.value, isInt = Number.isInteger(v);
            let relief;
            if (e.type === 'boolean') relief = bulkDir === 'down' ? 0 : 1;
            else { relief = bulkDir === 'down' ? v * (1 - bulkPct / 100) : v * (1 + bulkPct / 100); relief = isInt ? Math.round(relief) : Math.round(relief * 1000) / 1000; }
            if (relief === v) relief = bulkDir === 'down' ? Math.max(0, v - 1) : v + 1;
            return {
                apply_method: f.apply_method, config_path: cfgPath, config_format: cfgFmt || 'toml', config_key: e.key,
                value_type: isInt ? 'int' : 'float', default_value: v, relief_value: relief, step: Number(bulkStep), priority: Number(bulkPrio),
                name: e.key.split('.').pop(), lever_key: (cfgPath + '_' + e.key).replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 48), description: '',
            };
        });
        if (items.length) onBulk(items);
    };
    const num = ['default_value', 'relief_value', 'step', 'priority'];
    const diff = Number(f.relief_value) - Number(f.default_value);
    const dirInfo = diff < 0
        ? { text: `Lag'de AZALACAK (${f.default_value} → ${f.relief_value})`, color: A.warn }
        : diff > 0
            ? { text: `Lag'de ARTACAK (${f.default_value} → ${f.relief_value})`, color: A.warn }
            : { text: 'relief = normal → etkisiz. relief\'i değiştir (lag\'de gidilecek değer).', color: A.err };
    const submit = () => {
        const out = { ...f };
        for (const k of num) out[k] = Number(out[k]);
        if (Number(out.relief_value) === Number(out.default_value)) { toast.error('relief, normal değerden farklı olmalı'); return; }
        onSave(out);
    };
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 6, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{f.id ? 'Kaldıracı Düzenle' : 'Yeni Kaldıraç'}</h3>
                    <button type="button" onClick={onClose} title="Kapat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 4 }}><I.X size={16} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Ad"><Input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
                    <Field label="Anahtar (key)"><Input value={f.lever_key} onChange={e => set('lever_key', e.target.value)} disabled={!!f.id} /></Field>
                    <Field label="Yöntem">
                        <select value={f.apply_method} onChange={e => set('apply_method', e.target.value)} style={selStyle}>
                            <option value="gamerule">gamerule (canlı)</option>
                            <option value="command">command (canlı)</option>
                            <option value="config_reload">config_reload</option>
                            <option value="config_restart">config_restart</option>
                        </select>
                    </Field>
                    <Field label="Değer tipi">
                        <select value={f.value_type} onChange={e => set('value_type', e.target.value)} style={selStyle}>
                            <option value="int">int</option><option value="float">float</option>
                        </select>
                    </Field>
                    {!isConfig ? (
                        <Field label="Komut şablonu ({value})" span><Input value={f.apply_template} onChange={e => set('apply_template', e.target.value)} placeholder="gamerule randomTickSpeed {value}" /></Field>
                    ) : (
                        <>
                            <div style={{ gridColumn: '1 / -1', background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: 12 }}>
                                <Cap style={{ display: 'block', marginBottom: 8 }}>Mevcut config'den seç</Cap>
                                <Input value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder={`config dosyası ara… (${files.length} dosya, örn: pipez, create, mekanism)`} />
                                <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto', border: `1px solid ${A.border}`, borderRadius: 3 }}>
                                    {files.filter(x => x.path.toLowerCase().includes(fileSearch.toLowerCase())).slice(0, 200).map(file => (
                                        <button key={file.path} type="button" onClick={() => { setCfgPath(file.path); setCfgSearch(''); setSel({}); }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', background: cfgPath === file.path ? 'rgba(167,139,250,0.14)' : 'transparent', border: 'none', borderBottom: `1px solid ${A.border}`, padding: '6px 10px', cursor: 'pointer', color: cfgPath === file.path ? '#fff' : A.dim, fontFamily: A.mono, fontSize: 11 }}>
                                            {file.path} <span style={{ color: A.faint }}>({file.format})</span>
                                        </button>
                                    ))}
                                    {files.length === 0 && <div style={{ padding: 10, fontSize: 11, color: A.faint }}>Config dosyası bulunamadı (sunucu yolu / config klasörü?).</div>}
                                </div>
                                {cfgPath && <div style={{ marginTop: 6, fontSize: 11, color: A.ok, fontFamily: A.mono }}>Seçili: {cfgPath}</div>}
                                {cfgPath && (
                                    <>
                                        <div style={{ marginTop: 8 }}>
                                            <Input value={cfgSearch} onChange={e => setCfgSearch(e.target.value)} placeholder="anahtar ara… (örn: tick, speed, range, max)" />
                                        </div>
                                        <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', border: `1px solid ${A.border}`, borderRadius: 3 }}>
                                            {cfgErr ? <div style={{ padding: 10, fontSize: 11, color: A.err }}>Parse edilemedi: {cfgErr.response?.data?.error || 'hata'}</div>
                                                : cfgLoading ? <div style={{ padding: 10, fontSize: 11, color: A.faint }}>Okunuyor…</div>
                                                : cfgEntries.length === 0 ? <div style={{ padding: 10, fontSize: 11, color: A.faint }}>Sayısal anahtar bulunamadı.</div>
                                                : cfgEntries.slice(0, 300).map((e, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${A.border}`, padding: '4px 8px', background: sel[e.key] ? 'rgba(167,139,250,0.10)' : (f.config_key === e.key ? 'rgba(167,139,250,0.06)' : 'transparent') }}>
                                                        <input type="checkbox" checked={!!sel[e.key]} onChange={() => toggleSel(e)} />
                                                        <button type="button" onClick={() => pickEntry(e)} style={{ display: 'flex', justifyContent: 'space-between', flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', color: A.text, fontFamily: A.mono, fontSize: 11 }}>
                                                            <span style={{ color: A.dim, wordBreak: 'break-all', marginRight: 8 }}>{e.key}</span>
                                                            <span style={{ color: A.ok, flexShrink: 0 }}>{e.value}{e.type === 'boolean' ? ' (bool)' : ''}</span>
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                        {selCount > 0 && (
                                            <div style={{ marginTop: 10, padding: 10, background: 'rgba(167,139,250,0.08)', border: `1px solid ${A.border}`, borderRadius: 4 }}>
                                                <Cap style={{ display: 'block', marginBottom: 6 }}>{selCount} anahtar seçili — toplu ekle</Cap>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                    <div><Cap style={{ display: 'block', marginBottom: 2 }}>Lag'de</Cap><select value={bulkDir} onChange={e => setBulkDir(e.target.value)} style={selStyle}><option value="down">AZALT</option><option value="up">ARTIR</option></select></div>
                                                    <div style={{ width: 80 }}><Cap style={{ display: 'block', marginBottom: 2 }}>Oran %</Cap><Input type="number" value={bulkPct} onChange={e => setBulkPct(Number(e.target.value))} /></div>
                                                    <div style={{ width: 70 }}><Cap style={{ display: 'block', marginBottom: 2 }}>Adım</Cap><Input type="number" value={bulkStep} onChange={e => setBulkStep(Number(e.target.value))} /></div>
                                                    <div style={{ width: 80 }}><Cap style={{ display: 'block', marginBottom: 2 }}>Öncelik</Cap><Input type="number" value={bulkPrio} onChange={e => setBulkPrio(Number(e.target.value))} /></div>
                                                    <button type="button" onClick={doBulk} style={btnPrimary}>{selCount} kaldıraç ekle</button>
                                                </div>
                                                <div style={{ fontSize: 10, color: A.faint, marginTop: 6 }}>Örn: tüm <code style={{ fontFamily: A.mono }}>speed.*</code> anahtarlarını seç → "Lag'de ARTIR %50" → hepsi tek tıkla eklenir.</div>
                                            </div>
                                        )}
                                        <div style={{ fontSize: 10, color: A.faint, marginTop: 6 }}>Tek seçim: anahtara tıkla (alanlar dolar). Çoklu: kutucukları işaretle.</div>
                                    </>
                                )}
                            </div>
                            <Field label="Config yolu" span><Input value={f.config_path || ''} onChange={e => set('config_path', e.target.value)} placeholder="config/xxx.toml" /></Field>
                            <Field label="Format">
                                <select value={f.config_format || 'toml'} onChange={e => set('config_format', e.target.value)} style={selStyle}>
                                    <option value="toml">toml</option><option value="json">json</option><option value="properties">properties</option>
                                </select>
                            </Field>
                            <Field label="Config anahtarı"><Input value={f.config_key || ''} onChange={e => set('config_key', e.target.value)} placeholder="a.b.c" /></Field>
                            {f.apply_method === 'config_reload' && <Field label="Reload komutu" span><Input value={f.reload_command || ''} onChange={e => set('reload_command', e.target.value)} /></Field>}
                        </>
                    )}
                    <Field label="Normal değer (default)"><Input type="number" value={f.default_value} onChange={e => set('default_value', e.target.value)} /></Field>
                    <Field label="Lag'de gidilecek (relief)"><Input type="number" value={f.relief_value} onChange={e => set('relief_value', e.target.value)} /></Field>
                    <Field label="Adım (step)"><Input type="number" value={f.step} onChange={e => set('step', e.target.value)} /></Field>
                    <Field label="Öncelik (düşük=önce)"><Input type="number" value={f.priority} onChange={e => set('priority', e.target.value)} /></Field>
                    <Field label="Yön" span>
                        <div style={{ fontSize: 11, color: dirInfo.color, fontFamily: A.mono, padding: '6px 0' }}>{dirInfo.text}</div>
                    </Field>
                    <Field label="Açıklama" span><Input value={f.description || ''} onChange={e => set('description', e.target.value)} /></Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onClose} style={btnGhost}>İptal</button>
                    <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                </div>
            </div>
        </div>
    );
}

const selStyle = { background: 'var(--hoodoo-bg, #0a0b0d)', border: '1px solid #1f2228', color: '#e8eaed', fontSize: 12, padding: '7px 10px', borderRadius: 3, width: '100%', outline: 'none' };
function Field({ label, span, children }) {
    return <div style={{ gridColumn: span ? '1 / -1' : 'auto' }}><Cap style={{ display: 'block', marginBottom: 4 }}>{label}</Cap>{children}</div>;
}
