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
    value_type: 'int', default_value: 3, min_value: 0, max_value: 3,
    step_down: 1, step_up: 1, priority: 50, description: '',
};

export default function LagGuardPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('genel');
    const [obsSeconds, setObsSeconds] = useState(20);
    const [obsResult, setObsResult] = useState(null);
    const [editing, setEditing] = useState(null); // lever object or EMPTY_LEVER for new

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

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['lagguard-status'] });
        qc.invalidateQueries({ queryKey: ['lagguard-levers'] });
        qc.invalidateQueries({ queryKey: ['lagguard-history'] });
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
    const saveLever = useMutation({
        mutationFn: (l) => l.id ? api.put(`/lag-guard/levers/${l.id}`, l) : api.post('/lag-guard/levers', l),
        onSuccess: () => { invalidate(); setEditing(null); toast.success('Kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const runObservable = useMutation({
        mutationFn: (s) => api.post('/lag-guard/observable/run', { seconds: s }).then(r => r.data),
        onMutate: () => { setObsResult(null); toast.loading('Observable çalışıyor…', { id: 'obs' }); },
        onSuccess: (d) => { setObsResult(d); toast.dismiss('obs'); d.ok ? toast.success('Sonuç yakalandı') : toast.error(d.note || 'URL yok'); },
        onError: (e) => { toast.dismiss('obs'); toast.error(e.response?.data?.error || 'Çalıştırılamadı'); },
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
                {[{ id: 'genel', label: 'Genel', icon: I.Signal }, { id: 'levers', label: 'Kaldıraçlar', icon: I.Wrench }, { id: 'log', label: 'Aksiyon Logu', icon: I.Clock }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        background: 'transparent', border: 'none',
                        borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                        color: tab === t.id ? '#fff' : A.dim, fontSize: 12, fontWeight: 500,
                        padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <t.icon size={14} style={{ color: tab === t.id ? 'var(--accent)' : A.faint }} /> {t.label}
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

                    {levers.length === 0 ? <Empty text="Kaldıraç yok. 'Başlangıç Kütüphanesini Yükle' ile başla." /> : levers.map(l => {
                        const cur = l.current_value != null ? l.current_value : l.default_value;
                        const throttled = cur < l.default_value;
                        const pct = l.default_value !== l.min_value ? ((cur - l.min_value) / (l.default_value - l.min_value)) * 100 : 100;
                        return (
                            <div key={l.id} style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600 }}>{l.name}</span>
                                        <Pill color={l.enabled ? A.ok : A.faint}>{l.enabled ? 'AKTİF' : 'KAPALI'}</Pill>
                                        <Pill color="var(--accent)">{l.apply_method}</Pill>
                                        <Pill color={A.faint}>öncelik {l.priority}</Pill>
                                        {l.is_builtin ? <Pill color={A.faint}>yerleşik</Pill> : null}
                                    </div>
                                    {l.description ? <p style={{ fontSize: 11, color: A.dim, margin: '6px 0 0' }}>{l.description}</p> : null}
                                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontFamily: A.mono, fontSize: 12, color: throttled ? A.warn : A.ok, fontWeight: 600 }}>{cur}</span>
                                        <div style={{ flex: 1, maxWidth: 220, height: 5, background: A.bg, borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: throttled ? A.warn : A.ok }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>min {l.min_value} · def {l.default_value}{l.lag_ceiling != null ? ` · tavan ${l.lag_ceiling}` : ''}</span>
                                    </div>
                                    {l.apply_template ? <code style={{ display: 'block', marginTop: 6, fontSize: 10, color: A.faint, fontFamily: A.mono }}>{l.apply_template}</code> : null}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                    <Toggle value={!!l.enabled} onChange={() => toggleLever.mutate(l.id)} />
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
                    <Card title="Kaldıraç Değişiklik Geçmişi">
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead><tr style={{ borderBottom: `1px solid ${A.border}` }}>
                                    {['Zaman', 'Kaldıraç', 'Aksiyon', 'Mod', 'Eski', 'Yeni', 'MSPT'].map(h => <th key={h} style={{ padding: '6px 10px' }}><Cap>{h}</Cap></th>)}
                                </tr></thead>
                                <tbody>
                                    {history.length === 0 ? <tr><td colSpan={7} style={{ padding: 16, color: A.faint, textAlign: 'center' }}>Kayıt yok.</td></tr> :
                                        history.map(h => (
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

            {/* Kaldıraç ekle/düzenle modal */}
            {editing && <LeverModal lever={editing} onClose={() => setEditing(null)} onSave={(l) => saveLever.mutate(l)} saving={saveLever.isPending} />}
        </div>
    );
}

function Empty({ text = 'Veri bekleniyor…' }) {
    return <div style={{ color: A.faint, fontSize: 12, padding: '36px 0', textAlign: 'center' }}>{text}</div>;
}

function LeverModal({ lever, onClose, onSave, saving }) {
    const [f, setF] = useState(lever);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const isConfig = f.apply_method === 'config_reload' || f.apply_method === 'config_restart';
    const num = ['default_value', 'min_value', 'max_value', 'step_down', 'step_up', 'priority'];
    const submit = () => {
        const out = { ...f };
        for (const k of num) out[k] = Number(out[k]);
        onSave(out);
    };
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 6, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{f.id ? 'Kaldıracı Düzenle' : 'Yeni Kaldıraç'}</h3>
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
                    <Field label="Default"><Input type="number" value={f.default_value} onChange={e => set('default_value', e.target.value)} /></Field>
                    <Field label="Min"><Input type="number" value={f.min_value} onChange={e => set('min_value', e.target.value)} /></Field>
                    <Field label="Max"><Input type="number" value={f.max_value ?? ''} onChange={e => set('max_value', e.target.value)} /></Field>
                    <Field label="Öncelik (düşük=önce)"><Input type="number" value={f.priority} onChange={e => set('priority', e.target.value)} /></Field>
                    <Field label="Kısma adımı"><Input type="number" value={f.step_down} onChange={e => set('step_down', e.target.value)} /></Field>
                    <Field label="Açma adımı"><Input type="number" value={f.step_up} onChange={e => set('step_up', e.target.value)} /></Field>
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
