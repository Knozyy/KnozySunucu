import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Input } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

function formatCountdown(ms) {
    if (ms <= 0) return 'Çalışıyor / Bekliyor...';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}s ${m}d ${s}sn`;
    return `${m}d ${s}sn`;
}

function PauseIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
        </svg>
    );
}

function DocTextIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
    );
}

function RefreshIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
    );
}

// Seçim kutusu için ortak stil
const selectStyle = {
    background: A.bgDeeper, border: `1px solid ${A.border}`,
    borderRadius: 3, color: A.text, fontSize: 12,
    fontFamily: A.mono, padding: '7px 10px', outline: 'none',
    width: '100%', cursor: 'pointer',
};

function CountdownTimer({ nextRunStr, enabled }) {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!enabled || !nextRunStr) { setTimeLeft(0); return; }
        const nextRun = parseInt(nextRunStr, 10);
        const update = () => setTimeLeft(Math.max(0, nextRun - Date.now()));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [nextRunStr, enabled]);

    if (!enabled) return <span style={{ color: A.faint }}>Görev durduruldu</span>;
    if (!nextRunStr) return <span style={{ color: A.warn }}>Planlanıyor...</span>;

    const urgent = timeLeft < 60000 && timeLeft > 0;
    return (
        <span style={{
            fontFamily: A.mono, fontSize: 11,
            color: urgent ? A.warn : 'var(--accent)',
            fontWeight: urgent ? 700 : 400,
        }}>
            {formatCountdown(timeLeft)}
        </span>
    );
}

function LabelText({ children }) {
    return (
        <Cap style={{ display: 'block', marginBottom: 5 }}>{children}</Cap>
    );
}

// ── Hızlı Restart Geri Sayım ─────────────────────────────────────────────────
function OneTimeRestartCountdown({ restartAt }) {
    const [remaining, setRemaining] = useState(Math.max(0, restartAt - Date.now()));

    useEffect(() => {
        const update = () => setRemaining(Math.max(0, restartAt - Date.now()));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [restartAt]);

    const totalSec = Math.floor(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const urgent = totalSec <= 30;

    return (
        <span style={{
            fontFamily: A.mono, fontSize: 20, fontWeight: 700,
            color: urgent ? A.err : 'var(--accent)',
            letterSpacing: '0.05em',
        }}>
            {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
        </span>
    );
}

export default function SchedulerPage() {
    const [showForm, setShowForm] = useState(false);
    const [showLog,  setShowLog]  = useState(false);
    const [form, setForm] = useState({
        name: '', action: 'restart', intervalMinutes: 360,
        type: 'interval', actionData: {},
    });
    const [formInput, setFormInput] = useState({ intervalValue: 6, intervalUnit: 'hours' });
    const [restartDelay, setRestartDelay] = useState(5);
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data } = useQuery({
        queryKey: ['scheduler'],
        queryFn: () => api.get('/scheduler').then(r => r.data),
        refetchInterval: 30000,
    });

    const { data: logData } = useQuery({
        queryKey: ['schedulerLog'],
        queryFn: () => api.get('/scheduler/log').then(r => r.data),
        enabled: showLog,
        refetchInterval: showLog ? 5000 : false,
    });

    // ── Tek seferlik restart ──
    const { data: oneTimeData } = useQuery({
        queryKey: ['one-time-restart'],
        queryFn: () => api.get('/scheduler/one-time-restart').then(r => r.data),
        refetchInterval: 3000,
    });

    const scheduleRestartMutation = useMutation({
        mutationFn: (delayMinutes) => api.post('/scheduler/one-time-restart', { delayMinutes }),
        onSuccess: (res) => {
            toast.success(res.data?.message || 'Restart planlandı');
            queryClient.invalidateQueries({ queryKey: ['one-time-restart'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Planlanamadı'),
    });

    const cancelRestartMutation = useMutation({
        mutationFn: () => api.delete('/scheduler/one-time-restart'),
        onSuccess: () => {
            toast.success('Restart iptal edildi');
            queryClient.invalidateQueries({ queryKey: ['one-time-restart'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'İptal edilemedi'),
    });

    const oneTimeRestart = oneTimeData?.restart || null;

    const createMutation = useMutation({
        mutationFn: (d) => api.post('/scheduler', d),
        onSuccess: () => {
            toast.success('Görev oluşturuldu');
            setShowForm(false);
            setForm({ name: '', action: 'restart', intervalMinutes: 360, type: 'interval', actionData: {} });
            queryClient.invalidateQueries({ queryKey: ['scheduler'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Oluşturulamadı'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/scheduler/${id}`),
        onSuccess: () => { toast.success('Görev silindi'); queryClient.invalidateQueries({ queryKey: ['scheduler'] }); },
    });

    const toggleMutation = useMutation({
        mutationFn: (id) => api.post(`/scheduler/${id}/toggle`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
    });

    const { data: autoRestartData } = useQuery({
        queryKey: ['autoRestart'],
        queryFn: () => api.get('/minecraft/auto-restart').then(r => r.data),
        refetchInterval: 30000,
    });

    const autoRestartMutation = useMutation({
        mutationFn: (enabled) => api.put('/minecraft/auto-restart', { enabled }),
        onSuccess: (_, enabled) => {
            toast.success(enabled ? 'Otomatik başlatma açıldı' : 'Otomatik başlatma kapatıldı');
            queryClient.invalidateQueries({ queryKey: ['autoRestart'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Ayar güncellenemedi'),
    });

    const autoRestartEnabled = autoRestartData?.enabled ?? true;
    const crashHistory = autoRestartData?.crashes || [];
    const tasks = data?.tasks || [];

    const actionLabels = {
        restart:        '🔄 Yeniden Başlat',
        backup:         '💾 Yedek Al',
        announce:       '📢 Duyuru Yap',
        webhook:        '🔔 Webhook Gönder',
        clear_items:    '🗑️ Yerdeki Eşyaları Sil',
        custom_command: '⚡ Özel Komut Çalıştır',
    };

    const handleFormSubmit = () => {
        let finalMinutes = formInput.intervalValue;
        if (formInput.intervalUnit === 'hours') finalMinutes = formInput.intervalValue * 60;
        createMutation.mutate({ ...form, intervalMinutes: finalMinutes });
    };

    function logColor(entry) {
        const m = entry.message;
        if (m.includes('HATA') || m.includes('hatası')) return A.err;
        if (m.includes('başarıyla') || m.includes('tamamlandı') || m.includes('temizlendi')) return A.ok;
        if (m.includes('atlandı')) return A.warn;
        return A.faint;
    }

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>zamanlayıcı</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                        margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                        {t('scheduler.title')}
                    </h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>{t('scheduler.subtitle')}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setShowLog(!showLog)} style={{
                        ...btnGhost, padding: '7px 12px', fontSize: 11,
                        display: 'flex', alignItems: 'center', gap: 6,
                        borderColor: showLog ? 'var(--accent)' : undefined,
                        color: showLog ? 'var(--accent)' : A.dim,
                    }}>
                        <DocTextIcon size={13}/> Log
                    </button>
                    <button onClick={() => setShowForm(!showForm)} style={{
                        ...btnPrimary, padding: '7px 14px', fontSize: 11,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <I.Plus size={13}/> Yeni Görev
                    </button>
                </div>
            </div>

            {/* ── Hızlı Restart Planla ── */}
            <div style={{
                background: A.panel, border: `1px solid ${oneTimeRestart ? 'rgba(248,113,113,0.3)' : A.border}`,
                borderRadius: 4, padding: '16px 18px',
                ...(oneTimeRestart ? { boxShadow: '0 0 20px rgba(248,113,113,0.06)' } : {}),
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: oneTimeRestart ? 'rgba(248,113,113,0.10)' : 'rgba(96,165,250,0.08)',
                        border: `1px solid ${oneTimeRestart ? 'rgba(248,113,113,0.25)' : 'rgba(96,165,250,0.15)'}`,
                        color: oneTimeRestart ? A.err : '#60a5fa',
                    }}>
                        <I.Clock size={18}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: A.text, marginBottom: 3 }}>
                            Hızlı Restart Planla
                        </div>
                        <div style={{ fontSize: 11, color: A.dim }}>
                            {oneTimeRestart
                                ? 'Oyunculara dakika başı ve son 10 saniye geri sayım yapılıyor'
                                : 'Tek seferlik zamanlanmış restart — oyunculara uyarı verilir'}
                        </div>
                    </div>

                    {oneTimeRestart ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ textAlign: 'center' }}>
                                <OneTimeRestartCountdown restartAt={oneTimeRestart.restartAt}/>
                                <div style={{ fontSize: 9, color: A.faint, marginTop: 2, fontFamily: A.mono }}>
                                    KALAN SÜRE
                                </div>
                            </div>
                            <button onClick={() => cancelRestartMutation.mutate()}
                                disabled={cancelRestartMutation.isPending}
                                style={{
                                    ...btnGhost, padding: '8px 14px', fontSize: 11,
                                    color: A.err, borderColor: 'rgba(248,113,113,0.3)',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                <I.Stop size={11}/>
                                {cancelRestartMutation.isPending ? 'İPTAL...' : 'İPTAL ET'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Input type="number" min={1} max={1440}
                                    value={restartDelay}
                                    onChange={e => setRestartDelay(Math.max(1, parseInt(e.target.value) || 1))}
                                    mono style={{ width: 60, textAlign: 'center' }}/>
                                <span style={{ fontSize: 11, color: A.faint, whiteSpace: 'nowrap' }}>dakika</span>
                            </div>
                            <button onClick={() => {
                                if (confirm(`Sunucu ${restartDelay} dakika sonra yeniden başlatılacak. Oyunculara uyarı verilecek. Devam?`)) {
                                    scheduleRestartMutation.mutate(restartDelay);
                                }
                            }}
                                disabled={scheduleRestartMutation.isPending}
                                style={{
                                    ...btnPrimary, padding: '8px 14px', fontSize: 11,
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    whiteSpace: 'nowrap',
                                }}>
                                <RefreshIcon size={12}/>
                                {scheduleRestartMutation.isPending ? 'PLANLANIYOR...' : 'PLANLA'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Çalışma Logu ── */}
            {showLog && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 16px', borderBottom: `1px solid ${A.border}` }}>
                        <DocTextIcon size={13} style={{ color: '#60a5fa' }}/>
                        <Cap>Görev Çalışma Geçmişi</Cap>
                    </div>
                    <div style={{
                        maxHeight: 240, overflowY: 'auto',
                        background: A.bg, padding: '8px 16px',
                        display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                        {logData?.log?.length > 0 ? (
                            [...logData.log].reverse().map((entry, i) => (
                                <div key={i} style={{
                                    fontSize: 11, fontFamily: A.mono,
                                    padding: '2px 4px', borderRadius: 2,
                                    color: logColor(entry),
                                }}>
                                    <span style={{ color: A.border }}>
                                        {new Date(entry.time).toLocaleString('tr-TR')}
                                    </span>
                                    {' '}
                                    <span style={{ color: '#67e8f9' }}>[{entry.task}]</span>
                                    {' '}
                                    {entry.message}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '20px 0', textAlign: 'center',
                                fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                Henüz çalışma kaydı yok. Görev çalıştığında burada gözükecek.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Yeni Görev Formu ── */}
            {showForm && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '16px' }}>
                    <Cap style={{ marginBottom: 14, display: 'block', fontSize: 11 }}>Yeni Görev</Cap>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                        <div>
                            <LabelText>Görev Adı</LabelText>
                            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                placeholder="Örn: Otomatik restart" mono style={{ width: '100%', boxSizing: 'border-box' }}/>
                        </div>
                        <div>
                            <LabelText>İşlem</LabelText>
                            <select value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))}
                                style={selectStyle}>
                                <option value="restart">Sunucu Yeniden Başlat</option>
                                <option value="backup">Yedek Al</option>
                                <option value="announce">Oyun İçi Duyuru</option>
                                <option value="clear_items">Yerdeki Eşyaları Sil</option>
                                <option value="custom_command">Özel Komut Çalıştır</option>
                                <option value="webhook">Discord Webhook</option>
                            </select>
                        </div>
                        <div>
                            <LabelText>Tekrar Süresi</LabelText>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Input type="number" min={1}
                                    value={formInput.intervalValue}
                                    onChange={e => setFormInput(p => ({ ...p, intervalValue: parseInt(e.target.value) || 1 }))}
                                    mono style={{ flex: 1 }}/>
                                <select value={formInput.intervalUnit}
                                    onChange={e => setFormInput(p => ({ ...p, intervalUnit: e.target.value }))}
                                    style={{ ...selectStyle, width: 100 }}>
                                    <option value="minutes">Dakika</option>
                                    <option value="hours">Saat</option>
                                </select>
                            </div>
                        </div>
                        {(form.action === 'announce' || form.action === 'webhook' || form.action === 'custom_command') && (
                            <div>
                                <LabelText>
                                    {form.action === 'announce' ? 'Duyuru Mesajı'
                                        : form.action === 'custom_command' ? 'Özel Sunucu Komutu'
                                        : 'Webhook URL'}
                                </LabelText>
                                <Input type="text"
                                    value={form.action === 'announce' ? (form.actionData.message || '')
                                        : form.action === 'custom_command' ? (form.actionData.command || '')
                                        : (form.actionData.url || '')}
                                    onChange={e => setForm(p => ({
                                        ...p,
                                        actionData: form.action === 'announce' ? { message: e.target.value }
                                            : form.action === 'custom_command' ? { command: e.target.value }
                                            : { url: e.target.value, message: form.name },
                                    }))}
                                    placeholder={form.action === 'announce'
                                        ? 'Sunucu 5 dakika içinde kapanacak!'
                                        : form.action === 'custom_command' ? 'say Komut testi'
                                        : 'https://discord.com/api/webhooks/...'}
                                    mono style={{ width: '100%', boxSizing: 'border-box' }}/>
                                {form.action === 'custom_command' && (
                                    <p style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 4 }}>
                                        Başına '/' koymanıza gerek yoktur.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setShowForm(false)} style={{ ...btnGhost, padding: '7px 14px', fontSize: 11 }}>
                            İptal
                        </button>
                        <button onClick={handleFormSubmit}
                            disabled={!form.name || createMutation.isPending} style={{
                                ...btnPrimary, padding: '7px 16px', fontSize: 11,
                                opacity: (!form.name || createMutation.isPending) ? 0.5 : 1,
                                cursor: (!form.name || createMutation.isPending) ? 'not-allowed' : 'pointer',
                            }}>
                            {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Otomatik Yeniden Başlatma ── */}
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: autoRestartEnabled ? 'rgba(74,222,128,0.08)' : A.bgDeeper,
                        border: `1px solid ${autoRestartEnabled ? 'rgba(74,222,128,0.15)' : A.border}`,
                        color: autoRestartEnabled ? A.ok : A.faint,
                    }}>
                        <RefreshIcon size={16}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.text, marginBottom: 2 }}>
                            Çökme Sonrası Otomatik Yeniden Başlatma
                        </div>
                        <div style={{ fontSize: 11, color: A.dim }}>
                            Sunucu beklenmedik şekilde kapanırsa otomatik olarak yeniden başlatılır.
                            {crashHistory.length > 0 && (
                                <span style={{ marginLeft: 6, color: A.warn, fontFamily: A.mono }}>
                                    Son çöküm: {new Date(crashHistory[0].occurred_at).toLocaleString('tr-TR')}
                                </span>
                            )}
                        </div>
                        {crashHistory.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                {crashHistory.slice(0, 5).map(c => (
                                    <span key={c.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: 10, fontFamily: A.mono,
                                        padding: '2px 7px', borderRadius: 2,
                                        background: c.auto_restarted ? 'rgba(96,165,250,0.08)' : 'rgba(248,113,113,0.08)',
                                        border: `1px solid ${c.auto_restarted ? 'rgba(96,165,250,0.2)' : 'rgba(248,113,113,0.2)'}`,
                                        color: c.auto_restarted ? '#60a5fa' : A.err,
                                    }}>
                                        <I.Alert size={9}/>
                                        {new Date(c.occurred_at).toLocaleTimeString('tr-TR')} — code {c.exit_code}
                                        {c.auto_restarted ? ' ↻' : ' ✗'}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Toggle */}
                    <button
                        onClick={() => autoRestartMutation.mutate(!autoRestartEnabled)}
                        disabled={autoRestartMutation.isPending}
                        title={autoRestartEnabled ? 'Kapat' : 'Aç'}
                        style={{
                            position: 'relative', width: 44, height: 24, borderRadius: 12,
                            background: autoRestartEnabled ? A.ok : A.border,
                            border: 'none', cursor: autoRestartMutation.isPending ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s', flexShrink: 0, outline: 'none',
                        }}>
                        <span style={{
                            position: 'absolute', top: 3, width: 18, height: 18,
                            borderRadius: '50%', background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s',
                            transform: `translateX(${autoRestartEnabled ? 22 : 3}px)`,
                        }}/>
                    </button>
                </div>
            </div>

            {/* ── Görev Listesi ── */}
            {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '56px 20px' }}>
                    <I.Clock size={40} style={{ color: A.faint, margin: '0 auto 12px', display: 'block', opacity: 0.2 }}/>
                    <p style={{ fontSize: 14, color: A.dim, margin: '0 0 4px' }}>Henüz zamanlanmış görev yok</p>
                    <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>
                        Otomatik restart, yedek veya duyuru planlayın
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tasks.map(task => {
                        let displayInterval = `${task.interval_minutes} dakika`;
                        if (task.interval_minutes >= 60 && task.interval_minutes % 60 === 0)
                            displayInterval = `${task.interval_minutes / 60} saat`;

                        return (
                            <div key={task.id} style={{
                                background: A.panel, border: `1px solid ${A.border}`,
                                borderRadius: 4, padding: '14px 16px',
                                display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: task.enabled ? 'rgba(74,222,128,0.08)' : A.bgDeeper,
                                    border: `1px solid ${task.enabled ? 'rgba(74,222,128,0.15)' : A.border}`,
                                    color: task.enabled ? A.ok : A.faint,
                                }}>
                                    <I.Clock size={16}/>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: A.text, marginBottom: 2,
                                        display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {task.name}
                                        {task.action === 'custom_command' && task.action_data && (
                                            <span style={{
                                                fontSize: 10, fontFamily: A.mono, color: A.dim,
                                                background: A.bgDeeper, border: `1px solid ${A.border}`,
                                                padding: '1px 6px', borderRadius: 2,
                                            }}>
                                                /{JSON.parse(task.action_data).command}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, color: A.dim, marginBottom: 6 }}>
                                        {actionLabels[task.action] || task.action} · Her {displayInterval}'da
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {task.last_run && (
                                            <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                                Son: {new Date(task.last_run).toLocaleString('tr-TR')}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: 10, fontFamily: A.mono,
                                            background: A.bgDeeper, border: `1px solid ${A.border}`,
                                            padding: '2px 7px', borderRadius: 2,
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                        }}>
                                            Sonraki: <CountdownTimer nextRunStr={task.next_run} enabled={task.enabled}/>
                                        </span>
                                    </div>
                                </div>
                                {/* Pause / Play */}
                                <button onClick={() => toggleMutation.mutate(task.id)} style={{
                                    padding: '6px 8px', borderRadius: 3, cursor: 'pointer',
                                    background: task.enabled ? 'rgba(74,222,128,0.1)' : A.bgDeeper,
                                    border: `1px solid ${task.enabled ? 'rgba(74,222,128,0.2)' : A.border}`,
                                    color: task.enabled ? A.ok : A.faint,
                                    display: 'flex', alignItems: 'center',
                                }}>
                                    {task.enabled ? <PauseIcon size={14}/> : <I.Play size={14}/>}
                                </button>
                                {/* Sil */}
                                <button onClick={() => deleteMutation.mutate(task.id)} style={{
                                    ...btnGhost, padding: '6px 7px', color: A.err,
                                    borderColor: 'rgba(248,113,113,0.2)',
                                    display: 'flex', alignItems: 'center',
                                }}>
                                    <I.Trash size={14}/>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
