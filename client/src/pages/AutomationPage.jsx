import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Pill, Card, Input } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function formatExpiry(ts) {
    return new Date(ts * 1000).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}
function timeRemaining(ts) {
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'Süresi doldu';
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (d > 0) return `${d} gün ${h} sa`;
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
}
function msToHuman(ms) {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function Empty({ icon: Icon, text }) {
    return (
        <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
            {Icon ? <Icon size={28} style={{ opacity: 0.4, marginBottom: 10 }} /> : null}
            <div>{text}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AutomationPage() {
    const [tab, setTab] = useState('whitelist');
    const TABS = [
        { id: 'whitelist', label: 'Süreli Whitelist', icon: I.Clock },
        { id: 'restart', label: 'Restart Sayacı', icon: I.Power },
    ];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: A.sans, color: A.text }}>
            {/* Başlık */}
            <div>
                <Cap>Zamanlanmış İşlemler ve Otomatik Kurallar</Cap>
                <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <I.Power size={20} style={{ color: 'var(--accent)' }} /> Otomasyon
                </h1>
            </div>

            {/* Sekmeler */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${A.border}`, gap: 4 }}>
                {TABS.map(t => (
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

            {tab === 'whitelist' && <TimedWhitelistPanel />}
            {tab === 'restart' && <RestartCountdownPanel />}
        </div>
    );
}

// ══ Süreli Whitelist ═════════════════════════════════════════════════════════
function TimedWhitelistPanel() {
    const qc = useQueryClient();
    const [nick, setNick] = useState('');
    const [days, setDays] = useState('');
    const [hours, setHours] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['timed-whitelist'],
        queryFn: () => api.get('/automation/timed-whitelist').then(r => r.data),
        refetchInterval: 30000,
    });

    const addMutation = useMutation({
        mutationFn: () => api.post('/automation/timed-whitelist', {
            mcNick: nick.trim(), durationDays: Number(days) || 0, durationHours: Number(hours) || 0,
        }),
        onSuccess: (res) => { toast.success(res.data.message); setNick(''); setDays(''); setHours(''); qc.invalidateQueries({ queryKey: ['timed-whitelist'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/automation/timed-whitelist/${id}`),
        onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['timed-whitelist'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });

    const entries = data?.entries || [];
    // eslint-disable-next-line react-hooks/purity -- canlı kalan-süre için render anındaki zaman istenir
    const now = Math.floor(Date.now() / 1000);
    const active = entries.filter(e => e.expires_at > now);
    const expired = entries.filter(e => e.expires_at <= now);
    const canAdd = nick.trim() && (Number(days) > 0 || Number(hours) > 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title="Süreli Whitelist Erişimi" accent="var(--accent)">
                <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                    Bir oyuncuya geçici MC whitelist izni ver. Süre dolunca otomatik whitelist'ten çıkarılır.
                </p>
            </Card>

            {/* Ekleme formu */}
            <Card title="Yeni Geçici Erişim">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Minecraft Nick</Cap>
                        <Input mono value={nick} onChange={e => setNick(e.target.value)} placeholder="oyuncu_nick" />
                    </div>
                    <div style={{ width: 90 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Gün</Cap>
                        <Input type="number" mono value={days} onChange={e => setDays(e.target.value)} placeholder="0" />
                    </div>
                    <div style={{ width: 90 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Saat</Cap>
                        <Input type="number" mono value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
                    </div>
                    <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !canAdd}
                        style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, height: 34, opacity: (addMutation.isPending || !canAdd) ? 0.5 : 1 }}>
                        <I.Plus size={13} /> {addMutation.isPending ? 'Ekleniyor…' : 'Ekle'}
                    </button>
                </div>
            </Card>

            {/* Liste */}
            <Card title={`${active.length} aktif · ${expired.length} süresi dolmuş`}
                action={
                    <button onClick={() => qc.invalidateQueries({ queryKey: ['timed-whitelist'] })}
                        style={{ ...btnGhost, padding: '4px 8px' }} title="Yenile"><I.Restart size={12} /></button>
                }>
                {isLoading ? <Empty icon={I.Clock} text="Yükleniyor…" />
                    : entries.length === 0 ? <Empty icon={I.Clock} text="Henüz geçici erişim yok." />
                    : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {entries.map((entry, i) => {
                                const isExpired = entry.expires_at <= now;
                                return (
                                    <div key={entry.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                                        borderBottom: i !== entries.length - 1 ? `1px solid ${A.border}` : 'none',
                                        opacity: isExpired ? 0.55 : 1,
                                    }}>
                                        <img src={`https://mc-heads.net/avatar/${entry.mc_nick}/28`} alt={entry.mc_nick}
                                            style={{ width: 28, height: 28, borderRadius: 3, flexShrink: 0 }}
                                            onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.mc_nick}</div>
                                            <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                                                {isExpired ? 'Süresi doldu' : `${timeRemaining(entry.expires_at)} kaldı`} · {formatExpiry(entry.expires_at)}
                                            </div>
                                        </div>
                                        <Pill color={isExpired ? A.faint : A.ok}>{isExpired ? 'DOLDU' : 'AKTİF'}</Pill>
                                        <button onClick={() => deleteMutation.mutate(entry.id)}
                                            style={{ ...btnGhost, color: A.err, padding: '5px 8px' }} title="Sil ve whitelist'ten çıkar">
                                            <I.Trash size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </Card>
        </div>
    );
}

// ══ Restart Sayacı ═══════════════════════════════════════════════════════════
function RestartCountdownPanel() {
    const qc = useQueryClient();
    const [delayMinutes, setDelayMinutes] = useState('60');
    const [selectedWarnings, setSelectedWarnings] = useState([30, 10, 5, 1]);
    const WARNING_OPTIONS = [60, 30, 15, 10, 5, 1];

    const { data, isLoading } = useQuery({
        queryKey: ['restart-countdowns'],
        queryFn: () => api.get('/automation/restart-countdown').then(r => r.data),
        refetchInterval: 10000,
    });
    const startMutation = useMutation({
        mutationFn: () => api.post('/automation/restart-countdown', { delayMinutes: Number(delayMinutes), warnings: selectedWarnings }),
        onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['restart-countdowns'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Başlatılamadı'),
    });
    const cancelMutation = useMutation({
        mutationFn: (id) => api.delete(`/automation/restart-countdown/${id}`),
        onSuccess: () => { toast.success('Sayaç iptal edildi.'); qc.invalidateQueries({ queryKey: ['restart-countdowns'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'İptal edilemedi'),
    });
    const toggleWarning = (w) => setSelectedWarnings(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w].sort((a, b) => b - a));

    const countdowns = data?.countdowns || [];
    const mins = Number(delayMinutes) || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title="Zamanlanmış Yeniden Başlatma" accent={A.warn}>
                <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                    Sayaç başlatılınca seçili dakikalarda oyunculara otomatik uyarı mesajı atılır, süre dolunca sunucu yeniden başlar.
                </p>
            </Card>

            {/* Kurulum */}
            <Card title="Yeni Sayaç Başlat">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ width: 130 }}>
                        <Cap style={{ display: 'block', marginBottom: 4 }}>Restart süresi (dk)</Cap>
                        <Input type="number" mono value={delayMinutes} onChange={e => setDelayMinutes(e.target.value)} />
                    </div>
                    <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, paddingBottom: 9 }}>
                        ≈ {Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)} sa ` : ''}{mins % 60} dk sonra restart
                    </span>
                </div>

                <div style={{ marginTop: 14 }}>
                    <Cap style={{ display: 'block', marginBottom: 8 }}>Uyarı mesajları gönder (dakika kala)</Cap>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {WARNING_OPTIONS.map(w => {
                            const tooLong = w >= mins;
                            const selected = selectedWarnings.includes(w) && !tooLong;
                            return (
                                <button key={w} onClick={() => !tooLong && toggleWarning(w)} disabled={tooLong}
                                    style={{
                                        ...btnGhost, padding: '5px 12px', fontSize: 12, cursor: tooLong ? 'not-allowed' : 'pointer',
                                        borderColor: selected ? A.warn : A.border,
                                        background: selected ? 'rgba(251,191,36,0.12)' : 'transparent',
                                        color: tooLong ? A.faintest : selected ? A.warn : A.dim,
                                    }}>
                                    {w} dk
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !mins}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, opacity: (startMutation.isPending || !mins) ? 0.5 : 1 }}>
                    <I.Power size={13} /> {startMutation.isPending ? 'Başlatılıyor…' : 'Sayacı Başlat'}
                </button>
            </Card>

            {/* Aktif sayaçlar */}
            <Card title={countdowns.length > 0 ? `${countdowns.length} aktif sayaç` : 'Aktif Sayaç'}>
                {isLoading ? <Empty icon={I.Clock} text="Yükleniyor…" />
                    : countdowns.length === 0 ? <Empty icon={I.Check} text="Aktif restart sayacı yok." />
                    : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {countdowns.map(c => {
                                const pct = Math.max(0, Math.min(100, 100 - (c.remainingMs / (c.delayMinutes * 60 * 1000)) * 100));
                                return (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <I.Alert size={14} style={{ color: A.warn }} />
                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.delayMinutes} dakikalık restart sayacı</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, marginTop: 3 }}>
                                                Kalan: <span style={{ color: A.warn, fontWeight: 600 }}>{msToHuman(c.remainingMs)}</span>
                                                {' · '}Uyarılar: {c.warnings?.length ? c.warnings.map(w => `${w}dk`).join(', ') : 'Yok'}
                                            </div>
                                            <div style={{ marginTop: 8, height: 5, background: A.bg, borderRadius: 3, overflow: 'hidden', maxWidth: 320 }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: A.warn, transition: 'width 1s linear' }} />
                                            </div>
                                        </div>
                                        <button onClick={() => cancelMutation.mutate(c.id)}
                                            style={{ ...btnGhost, color: A.err, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                            <I.X size={13} /> İptal Et
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </Card>
        </div>
    );
}
