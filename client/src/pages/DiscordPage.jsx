import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnGhost, btnPrimary } from '@/hodo/tokens';
import { Cap, Dot, Pill } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function timeAgo(ts) {
    const diff = Math.floor((ts * 1000 - Date.now()) / 1000);
    if (diff > 0) {
        if (diff < 3600) return `${Math.ceil(diff / 60)} dk`;
        if (diff < 86400) return `${Math.ceil(diff / 3600)} sa`;
        return `${Math.ceil(diff / 86400)} gün`;
    }
    return 'Süresi doldu';
}

function formatExpiry(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const card = {
    background: A.panel,
    border: `1px solid ${A.border}`,
    borderRadius: 4,
};

const inputStyle = {
    background: A.bg,
    border: `1px solid ${A.border}`,
    color: A.text,
    fontFamily: A.mono,
    fontSize: 12,
    padding: '7px 10px',
    borderRadius: 2,
    outline: 'none',
    width: '100%',
};

// ── Discord Logo ─────────────────────────────────────────────────────────────

function DiscordIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.84 19.84 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42c0-1.336.956-2.42 2.157-2.42c1.21 0 2.176 1.094 2.157 2.42c0 1.335-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42c0-1.336.955-2.42 2.157-2.42c1.21 0 2.176 1.094 2.157 2.42c0 1.335-.946 2.42-2.157 2.42z"/>
        </svg>
    );
}

// ── Oyuncu grafiği ───────────────────────────────────────────────────────────

function PlayerGraph({ history }) {
    const chart = useMemo(() => {
        const cutoff = Date.now() / 1000 - 86400;
        const raw = history.filter(h => h.timestamp > cutoff);
        if (raw.length < 2) return null;

        const MAX_PTS = 150;
        const step = Math.max(1, Math.ceil(raw.length / MAX_PTS));
        const sampled = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);

        const W = 700, H = 200;
        const PADL = 44, PADR = 20, PADT = 12, PADB = 32;
        const CW = W - PADL - PADR;
        const CH = H - PADT - PADB;

        const maxCount = Math.max(...sampled.map(h => h.count), 1);
        const minTs = sampled[0].timestamp;
        const maxTs = sampled[sampled.length - 1].timestamp;
        const tsRange = Math.max(maxTs - minTs, 1);

        const pts = sampled.map(h => ({
            x: PADL + ((h.timestamp - minTs) / tsRange) * CW,
            y: PADT + (1 - h.count / maxCount) * CH,
            count: h.count,
            ts: h.timestamp,
        }));

        const Y_TICKS = 4;
        const yLines = Array.from({ length: Y_TICKS + 1 }, (_, i) => ({
            y: PADT + (i / Y_TICKS) * CH,
            label: Math.round(maxCount * (1 - i / Y_TICKS)),
        }));

        const X_TICKS = Math.min(6, sampled.length);
        const xTicks = Array.from({ length: X_TICKS }, (_, i) => {
            const idx = Math.round(i * (sampled.length - 1) / Math.max(X_TICKS - 1, 1));
            const d = new Date(sampled[idx].timestamp * 1000);
            return {
                x: pts[idx].x,
                label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
            };
        });

        let linePath = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const cp = (pts[i - 1].x + pts[i].x) / 2;
            linePath += ` C ${cp} ${pts[i - 1].y}, ${cp} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
        }
        const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${PADT + CH} L ${pts[0].x} ${PADT + CH} Z`;
        const avgCount = Math.round(sampled.reduce((s, h) => s + h.count, 0) / sampled.length);

        return { W, H, PADL, PADT, CW, CH, pts, yLines, xTicks, linePath, areaPath, maxCount, avgCount };
    }, [history]);

    if (!chart) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 200, color: A.faint, gap: 10,
            }}>
                <I.Chat size={28} style={{ opacity: 0.3 }}/>
                <p style={{ fontSize: 12, margin: 0 }}>Yeterli veri yok</p>
                <p style={{ fontSize: 10, color: A.faintest, margin: 0 }}>
                    Bot çalışırken her 30 saniyede bir kayıt oluşturulur
                </p>
            </div>
        );
    }

    const { W, H, PADL, PADT, CW, CH, pts, yLines, xTicks, linePath, areaPath, maxCount, avgCount } = chart;
    const currentCount = pts[pts.length - 1].count;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <Stat label="Şu an online" value={currentCount}/>
                <div style={{ width: 1, height: 30, background: A.border }}/>
                <Stat label="Son 24sa maks." value={maxCount} accent/>
                <div style={{ width: 1, height: 30, background: A.border }}/>
                <Stat label="Ortalama" value={avgCount} dim/>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Dot color="var(--accent)" size={6}/>
                    <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                        {pts.length} nokta · son 24 saat
                    </span>
                </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
                <defs>
                    <linearGradient id="pg-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.25"/>
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.01"/>
                    </linearGradient>
                    <clipPath id="pg-clip">
                        <rect x={PADL} y={PADT} width={CW} height={CH + 1}/>
                    </clipPath>
                </defs>

                {yLines.map((t, i) => (
                    <g key={i}>
                        <line x1={PADL} y1={t.y} x2={W - 20} y2={t.y}
                            stroke={i === yLines.length - 1 ? A.borderHi : A.border} strokeWidth="1"/>
                        <text x={PADL - 10} y={t.y + 4} textAnchor="end" fontSize="11"
                            fill={A.faint} fontFamily={A.mono}>{t.label}</text>
                    </g>
                ))}

                <g clipPath="url(#pg-clip)">
                    <path d={areaPath} fill="url(#pg-grad)"/>
                    <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </g>

                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y}
                    r="5" fill="var(--accent)" stroke={A.panel} strokeWidth="2.5"/>

                <line x1={PADL} y1={PADT + CH} x2={W - 20} y2={PADT + CH} stroke={A.border} strokeWidth="1"/>
                {xTicks.map((t, i) => (
                    <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize="11"
                        fill={A.faint} fontFamily={A.mono}>{t.label}</text>
                ))}
                <line x1={PADL} y1={PADT} x2={PADL} y2={PADT + CH} stroke={A.border} strokeWidth="1"/>
            </svg>
        </div>
    );
}

function Stat({ label, value, accent, dim }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                fontFamily: A.mono, fontSize: 22, fontWeight: 600,
                color: accent ? 'var(--accent)' : (dim ? A.faint : A.text),
                letterSpacing: '-0.02em',
            }}>{value}</div>
            <div style={{ fontSize: 10, color: A.faint, marginTop: 2 }}>{label}</div>
        </div>
    );
}

// ── Tek satır oyuncu/rol/log ────────────────────────────────────────────────

function Row({ children, last, style }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            borderBottom: last ? 'none' : `1px solid ${A.border}`,
            ...style,
        }}>{children}</div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// ANA SAYFA
// ═════════════════════════════════════════════════════════════════════════════

export default function DiscordPage() {
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState('whitelist');
    const [wlSearch, setWlSearch] = useState('');
    const [newUserId, setNewUserId] = useState('');
    const [newMcNick, setNewMcNick] = useState('');
    const [botDirInput, setBotDirInput] = useState('');
    const [showConfig, setShowConfig] = useState(false);
    const [statusTextInput, setStatusTextInput] = useState('');

    // ── Queries ───────────────────────────────────────────────────────────────

    const { data: status, isLoading: statusLoading } = useQuery({
        queryKey: ['discord-status'],
        queryFn: () => api.get('/discord/status').then(r => r.data),
        refetchInterval: 10000,
    });
    useEffect(() => {
        if (!botDirInput && status?.botDir) setBotDirInput(status.botDir);
    }, [status, botDirInput]);

    const { data: botSettings } = useQuery({
        queryKey: ['discord-bot-settings'],
        queryFn: () => api.get('/discord/bot-settings').then(r => r.data),
    });
    useEffect(() => {
        if (botSettings?.status_text) setStatusTextInput(botSettings.status_text);
    }, [botSettings]);

    const { data: wlData, isLoading: wlLoading } = useQuery({
        queryKey: ['discord-whitelist'],
        queryFn: () => api.get('/discord/whitelist').then(r => r.data),
        enabled: activeTab === 'whitelist',
    });

    const { data: rolesData, isLoading: rolesLoading } = useQuery({
        queryKey: ['discord-timed-roles'],
        queryFn: () => api.get('/discord/timed-roles').then(r => r.data),
        enabled: activeTab === 'timed-roles',
    });

    const { data: queueData, isLoading: queueLoading } = useQuery({
        queryKey: ['discord-rcon-queue'],
        queryFn: () => api.get('/discord/rcon-queue').then(r => r.data),
        enabled: activeTab === 'rcon-queue',
        refetchInterval: activeTab === 'rcon-queue' ? 15000 : false,
    });

    const { data: statusMsgData, isLoading: statusMsgLoading } = useQuery({
        queryKey: ['discord-status-messages'],
        queryFn: () => api.get('/discord/status-messages').then(r => r.data),
        enabled: activeTab === 'status-messages',
    });

    const { data: historyData } = useQuery({
        queryKey: ['discord-history'],
        queryFn: () => api.get('/discord/player-history').then(r => r.data),
        enabled: activeTab === 'graph',
    });

    // ── Mutations ─────────────────────────────────────────────────────────────

    const startMutation = useMutation({
        mutationFn: () => api.post('/discord/start'),
        onSuccess: () => { toast.success('Bot başlatılıyor...'); queryClient.invalidateQueries({ queryKey: ['discord-status'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Başlatılamadı'),
    });
    const stopMutation = useMutation({
        mutationFn: () => api.post('/discord/stop'),
        onSuccess: () => { toast.success('Bot durduruldu.'); queryClient.invalidateQueries({ queryKey: ['discord-status'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Durdurulamadı'),
    });
    const configMutation = useMutation({
        mutationFn: (botDir) => api.put('/discord/config', { botDir }),
        onSuccess: () => { toast.success('Bot dizini kaydedildi.'); queryClient.invalidateQueries({ queryKey: ['discord-status'] }); setShowConfig(false); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const botSettingsMutation = useMutation({
        mutationFn: (settings) => api.put('/discord/bot-settings', settings),
        onSuccess: () => toast.success('Bot ayarı kaydedildi. Bot yeniden başlatılınca geçerli olur.'),
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });
    const addWlMutation = useMutation({
        mutationFn: ({ userId, mcNick }) => api.post('/discord/whitelist', { userId, mcNick }),
        onSuccess: () => {
            toast.success('Eklendi.');
            setNewUserId(''); setNewMcNick('');
            queryClient.invalidateQueries({ queryKey: ['discord-whitelist'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });
    const delWlMutation = useMutation({
        mutationFn: (userId) => api.delete(`/discord/whitelist/${userId}`),
        onSuccess: () => { toast.success('Silindi.'); queryClient.invalidateQueries({ queryKey: ['discord-whitelist'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });
    const addRoleMutation = useMutation({
        mutationFn: (data) => api.post('/discord/timed-roles', data),
        onSuccess: () => { toast.success('Süreli rol eklendi.'); queryClient.invalidateQueries({ queryKey: ['discord-timed-roles'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });
    const delRoleMutation = useMutation({
        mutationFn: (index) => api.delete(`/discord/timed-roles/${index}`),
        onSuccess: () => { toast.success('Silindi.'); queryClient.invalidateQueries({ queryKey: ['discord-timed-roles'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });
    const clearQueueMutation = useMutation({
        mutationFn: () => api.delete('/discord/rcon-queue'),
        onSuccess: () => { toast.success('RCON kuyruğu temizlendi.'); queryClient.invalidateQueries({ queryKey: ['discord-rcon-queue'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Temizlenemedi'),
    });
    const addStatusMsgMutation = useMutation({
        mutationFn: ({ serverName, message }) => api.post('/discord/status-messages', { serverName, message }),
        onSuccess: () => { toast.success('Mesaj eklendi.'); queryClient.invalidateQueries({ queryKey: ['discord-status-messages'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });
    const delStatusMsgMutation = useMutation({
        mutationFn: ({ serverName, index }) => api.delete('/discord/status-messages', { data: { serverName, index } }),
        onSuccess: () => { toast.success('Mesaj silindi.'); queryClient.invalidateQueries({ queryKey: ['discord-status-messages'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });

    // ── Filtered whitelist ────────────────────────────────────────────────────

    const filteredEntries = useMemo(() => {
        const entries = wlData?.entries || [];
        if (!wlSearch.trim()) return entries;
        const q = wlSearch.toLowerCase();
        return entries.filter(e =>
            e.mcNick.toLowerCase().includes(q) ||
            e.userId.includes(q) ||
            (e.discordName || '').toLowerCase().includes(q) ||
            (e.username || '').toLowerCase().includes(q)
        );
    }, [wlData, wlSearch]);

    const now = Math.floor(Date.now() / 1000);
    const timedRoles = rolesData?.roles || [];
    const activeRoles  = timedRoles.filter(r => r.expiry_timestamp > now);
    const expiredRoles = timedRoles.filter(r => r.expiry_timestamp <= now);

    const isRunning = status?.running;

    const TABS = [
        { key: 'whitelist',       label: 'Whitelist',        icon: I.Users },
        { key: 'timed-roles',     label: 'Süreli Roller',    icon: I.Clock },
        { key: 'rcon-queue',      label: 'RCON Kuyruğu',     icon: I.Stack },
        { key: 'status-messages', label: 'Durum Mesajları',  icon: I.Chat },
        { key: 'night-guard',     label: 'Gece Koruması',    icon: I.Alert },
        { key: 'graph',           label: 'Oyuncu Grafiği',   icon: I.ArrowUpRight },
        { key: 'webhook',         label: 'Webhook',          icon: I.Send },
    ];

    return (
        <div style={{
            padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text,
        }}>
            <style>{`@keyframes hodo-spin{to{transform:rotate(360deg)}}`}</style>

            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>discord</Cap>
                    <h1 style={{
                        fontSize: 22, fontWeight: 600, color: A.text,
                        margin: '4px 0 2px', letterSpacing: '-0.01em',
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <span style={{ color: '#5865f2' }}><DiscordIcon size={22}/></span>
                        Discord Bot
                    </h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0, fontFamily: A.mono }}>
                        KnozyBot — Discord ↔ Minecraft entegrasyonu
                    </p>
                </div>
                <button onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['discord-status'] });
                    queryClient.invalidateQueries({ queryKey: ['discord-whitelist'] });
                }} style={btnGhost}>
                    <I.Restart size={12} style={{ verticalAlign: -1 }}/>
                </button>
            </div>

            {/* ── Bot Durum Kartı ── */}
            <div style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {statusLoading ? (
                            <div style={{
                                width: 16, height: 16, border: `2px solid ${A.border}`,
                                borderTopColor: 'var(--accent)', borderRadius: '50%',
                                animation: 'hodo-spin 0.8s linear infinite',
                            }}/>
                        ) : (
                            <Dot color={isRunning ? A.ok : A.err} size={10}/>
                        )}
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>
                                {isRunning ? 'Bot Çalışıyor' : 'Bot Kapalı'}
                            </div>
                            <div style={{ fontSize: 10.5, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                                screen: {status?.screenName || 'knozy-discord'}
                                {status?.botDir ? ` · ${status.botDir}` : ' · dizin ayarlanmamış'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setShowConfig(v => !v)} style={btnGhost} title="Bot dizinini ayarla">
                            <I.Cog size={11}/>
                        </button>
                        {isRunning ? (
                            <button onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}
                                style={{ ...btnGhost, color: A.err, borderColor: 'rgba(248,113,113,0.3)' }}>
                                <I.Stop size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                                {stopMutation.isPending ? 'DURDURULUYOR...' : 'DURDUR'}
                            </button>
                        ) : (
                            <button onClick={() => startMutation.mutate()}
                                disabled={startMutation.isPending || !status?.botDir} style={btnPrimary}>
                                <I.Play size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                                {startMutation.isPending ? 'BAŞLATILIYOR...' : 'BAŞLAT'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Bot dizini + status ayar formu */}
                {showConfig && (
                    <div style={{
                        marginTop: 14, paddingTop: 14, borderTop: `1px solid ${A.border}`,
                        display: 'flex', flexDirection: 'column', gap: 14,
                    }}>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>
                                Bot Dizini (sunucudaki mutlak yol)
                            </Cap>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input type="text" value={botDirInput}
                                    onChange={e => setBotDirInput(e.target.value)}
                                    placeholder="/home/user/KnozyBot"
                                    style={{ ...inputStyle, flex: 1 }}/>
                                <button onClick={() => configMutation.mutate(botDirInput)}
                                    disabled={configMutation.isPending || !botDirInput.trim()}
                                    style={btnPrimary}>
                                    <I.Check size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                                    {configMutation.isPending ? 'KAYDET...' : 'KAYDET'}
                                </button>
                            </div>
                            {status && !status.dirExists && status.botDir && (
                                <div style={{ fontSize: 11, color: A.warn, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <I.Alert size={12}/>Dizin sunucuda bulunamadı. Yolu kontrol edin.
                                </div>
                            )}
                        </div>

                        <div>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>
                                Discord Status Metni
                            </Cap>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input type="text" value={statusTextInput}
                                    onChange={e => setStatusTextInput(e.target.value)}
                                    placeholder="HooDoo FTB Evolution"
                                    style={{ ...inputStyle, flex: 1, fontFamily: A.sans }}
                                    maxLength={128}/>
                                <button onClick={() => botSettingsMutation.mutate({ status_text: statusTextInput.trim() || null })}
                                    disabled={botSettingsMutation.isPending} style={btnPrimary}>
                                    <I.Check size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                                    {botSettingsMutation.isPending ? 'KAYDET...' : 'KAYDET'}
                                </button>
                            </div>
                            <p style={{ fontSize: 11, color: A.faint, margin: '6px 0 0' }}>
                                Boş bırakırsan oyuncu sayısı otomatik gösterilir.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Sekmeler ── */}
            <div style={{
                display: 'flex', gap: 4, flexWrap: 'wrap',
                borderBottom: `1px solid ${A.border}`,
            }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                                color: active ? A.text : A.dim,
                                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                fontFamily: A.sans,
                                marginBottom: -1,
                            }}>
                            <Icon size={13} style={{ color: active ? 'var(--accent)' : A.faint }}/>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ══ Whitelist ══ */}
            {activeTab === 'whitelist' && (
                <>
                    <div style={{ ...card, padding: 14 }}>
                        <Cap style={{ display: 'block', marginBottom: 10 }}>+ Yeni Kayıt Ekle</Cap>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input type="text" value={newUserId} onChange={e => setNewUserId(e.target.value)}
                                placeholder="Discord ID (123456789012345678)"
                                style={{ ...inputStyle, flex: 1, minWidth: 200 }}/>
                            <input type="text" value={newMcNick} onChange={e => setNewMcNick(e.target.value)}
                                placeholder="Minecraft Nick"
                                style={{ ...inputStyle, width: 200 }}
                                onKeyDown={e => { if (e.key === 'Enter' && newUserId && newMcNick) addWlMutation.mutate({ userId: newUserId, mcNick: newMcNick }); }}/>
                            <button onClick={() => addWlMutation.mutate({ userId: newUserId, mcNick: newMcNick })}
                                disabled={addWlMutation.isPending || !newUserId.trim() || !newMcNick.trim()}
                                style={btnPrimary}>
                                <I.Plus size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                                {addWlMutation.isPending ? 'EKLE...' : 'EKLE'}
                            </button>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <I.Search size={13} style={{
                            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: A.faint,
                        }}/>
                        <input type="text" value={wlSearch} onChange={e => setWlSearch(e.target.value)}
                            placeholder="Minecraft nick, Discord ismi veya ID ile ara..."
                            style={{ ...inputStyle, paddingLeft: 32, fontFamily: A.sans }}/>
                    </div>

                    <div style={card}>
                        <div style={{
                            padding: '10px 16px', borderBottom: `1px solid ${A.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <Cap>{wlData?.total ?? 0} kayıtlı oyuncu</Cap>
                        </div>
                        {wlLoading ? (
                            <div style={{ padding: 32, textAlign: 'center', color: A.faint, fontSize: 12 }}>Yükleniyor...</div>
                        ) : filteredEntries.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: A.faint }}>
                                <I.Users size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                                <p style={{ margin: 0, fontSize: 12 }}>
                                    {wlSearch ? 'Eşleşen kayıt bulunamadı.' : 'Henüz kayıtlı oyuncu yok.'}
                                </p>
                            </div>
                        ) : (
                            filteredEntries.map((e, i) => {
                                // Discord ismi yoksa (bot token bulunamadıysa) fallback olarak ID göster
                                const discordLine = e.discordName || e.username || `Discord ID: ${e.userId}`;
                                const discordKnown = !!(e.discordName || e.username);
                                return (
                                    <Row key={e.userId} last={i === filteredEntries.length - 1}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 4,
                                            background: 'rgba(167,139,250,0.10)',
                                            border: '1px solid rgba(167,139,250,0.20)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'var(--accent)', fontSize: 12, fontWeight: 700,
                                            fontFamily: A.mono, flexShrink: 0,
                                        }}>{e.mcNick[0].toUpperCase()}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* 1. satır: Minecraft ismi */}
                                            <div style={{
                                                fontSize: 13, fontWeight: 600, color: A.text,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{e.mcNick}</div>
                                            {/* 2. satır: Discord ismi (ID değil) */}
                                            <div style={{
                                                fontSize: 11, color: discordKnown ? A.dim : A.faint,
                                                fontFamily: discordKnown ? A.sans : A.mono,
                                                marginTop: 2, display: 'flex', alignItems: 'center', gap: 6,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }} title={`Discord ID: ${e.userId}`}>
                                                {discordKnown && <I.Chat size={10} style={{ color: '#5865f2', flexShrink: 0 }}/>}
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {discordLine}
                                                </span>
                                                <button onClick={() => { navigator.clipboard.writeText(e.userId); toast.success('ID kopyalandı'); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: A.faint, display: 'inline-flex', flexShrink: 0 }}
                                                    title={`Discord ID: ${e.userId} (kopyalamak için tıkla)`}>
                                                    <I.ArrowUpRight size={10}/>
                                                </button>
                                            </div>
                                        </div>
                                        <button onClick={() => { if (confirm(`${e.mcNick} çıkarılacak. Emin misin?`)) delWlMutation.mutate(e.userId); }}
                                            style={{ ...btnGhost, padding: '4px 8px', color: A.err, borderColor: 'rgba(248,113,113,0.25)' }}>
                                            <I.Trash size={11}/>
                                        </button>
                                    </Row>
                                );
                            })
                        )}
                    </div>
                </>
            )}

            {/* ══ Süreli Roller ══ */}
            {activeTab === 'timed-roles' && (
                <TimedRolesTab rolesLoading={rolesLoading} timedRoles={timedRoles}
                    activeRoles={activeRoles} expiredRoles={expiredRoles} now={now}
                    addRoleMutation={addRoleMutation} delRoleMutation={delRoleMutation}/>
            )}

            {/* ══ RCON Kuyruğu ══ */}
            {activeTab === 'rcon-queue' && (
                <RconQueueTab queueData={queueData} queueLoading={queueLoading}
                    clearQueueMutation={clearQueueMutation}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['discord-rcon-queue'] })}/>
            )}

            {/* ══ Durum Mesajları ══ */}
            {activeTab === 'status-messages' && (
                <StatusMessagesTab statusMsgData={statusMsgData} statusMsgLoading={statusMsgLoading}
                    addStatusMsgMutation={addStatusMsgMutation} delStatusMsgMutation={delStatusMsgMutation}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['discord-status-messages'] })}/>
            )}

            {/* ══ Gece Koruması ══ */}
            {activeTab === 'night-guard' && <NightGuardTab/>}

            {/* ══ Grafik ══ */}
            {activeTab === 'graph' && (
                <div style={{ ...card, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Cap>SON 24 SAAT OYUNCU GRAFİĞİ</Cap>
                        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['discord-history'] })}
                            style={btnGhost}>
                            <I.Restart size={11}/>
                        </button>
                    </div>
                    <PlayerGraph history={historyData?.history || []}/>
                </div>
            )}

            {/* ══ Webhook ══ */}
            {activeTab === 'webhook' && <WebhookTab/>}
        </div>
    );
}

// ── Süreli Roller ────────────────────────────────────────────────────────────

function TimedRolesTab({ rolesLoading, timedRoles, activeRoles, expiredRoles, now, addRoleMutation, delRoleMutation }) {
    const [form, setForm] = useState({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' });
    const [showForm, setShowForm] = useState(false);

    const handleAdd = () => {
        addRoleMutation.mutate(form, {
            onSuccess: () => { setForm({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' }); setShowForm(false); },
        });
    };

    return (
        <>
            <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>{activeRoles.length} aktif · {expiredRoles.length} süresi dolmuş</Cap>
                <button onClick={() => setShowForm(v => !v)} style={btnGhost}>
                    <I.Plus size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>YENİ EKLE
                </button>
            </div>

            {showForm && (
                <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Cap>YENİ SÜRELİ ROL</Cap>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Kullanıcı ID</div>
                            <input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                                style={inputStyle} placeholder="123456789..."/>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Sunucu (Guild) ID</div>
                            <input value={form.guild_id} onChange={e => setForm(f => ({ ...f, guild_id: e.target.value }))}
                                style={inputStyle} placeholder="987654321..."/>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Rol ID</div>
                            <input value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                                style={inputStyle} placeholder="111222333..."/>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Gün</div>
                                <input type="number" value={form.durationDays}
                                    onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))}
                                    style={inputStyle} placeholder="0" min="0"/>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Saat</div>
                                <input type="number" value={form.durationHours}
                                    onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))}
                                    style={inputStyle} placeholder="0" min="0" max="23"/>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowForm(false)} style={btnGhost}>İPTAL</button>
                        <button onClick={handleAdd}
                            disabled={addRoleMutation.isPending || !form.user_id || !form.guild_id || !form.role_id}
                            style={btnPrimary}>
                            {addRoleMutation.isPending ? 'EKLE...' : 'EKLE'}
                        </button>
                    </div>
                </div>
            )}

            <div style={card}>
                {rolesLoading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: A.faint, fontSize: 12 }}>Yükleniyor...</div>
                ) : timedRoles.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: A.faint }}>
                        <I.Clock size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                        <p style={{ margin: 0, fontSize: 12 }}>Süreli rol kaydı yok.</p>
                    </div>
                ) : (
                    timedRoles.map((r, i) => {
                        const expired = r.expiry_timestamp <= now;
                        const userLabel  = r.discordName || r.username || `ID: ${r.user_id}`;
                        const roleLabel  = r.roleName   ? `@${r.roleName}` : `Rol ID: ${r.role_id}`;
                        const guildLabel = r.guildName  || `Guild ID: ${r.guild_id}`;
                        // Rol rengi int (0–0xFFFFFF) — hex'e çevir
                        const roleHex = r.roleColor && r.roleColor > 0
                            ? `#${r.roleColor.toString(16).padStart(6, '0')}`
                            : null;
                        return (
                            <Row key={i} last={i === timedRoles.length - 1}
                                style={{ opacity: expired ? 0.55 : 1 }}>
                                <Dot color={expired ? A.faint : A.ok} size={6}/>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* 1. satır: Discord kullanıcı + rol */}
                                    <div style={{
                                        fontSize: 12.5, color: A.text, display: 'flex',
                                        alignItems: 'center', gap: 8, flexWrap: 'wrap',
                                    }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            title={`Discord ID: ${r.user_id}`}>
                                            <I.Chat size={11} style={{ color: '#5865f2' }}/>
                                            <strong style={{ fontWeight: 600 }}>{userLabel}</strong>
                                        </span>
                                        <span style={{ color: A.faintest }}>→</span>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            padding: '2px 8px', borderRadius: 99,
                                            background: roleHex ? `${roleHex}1f` : 'rgba(167,139,250,0.10)',
                                            color: roleHex || 'var(--accent)',
                                            fontSize: 11, fontWeight: 500,
                                        }} title={`Rol ID: ${r.role_id}`}>
                                            {roleLabel}
                                        </span>
                                    </div>
                                    {/* 2. satır: Guild + süre */}
                                    <div style={{ fontSize: 10.5, color: A.faint, marginTop: 4, fontFamily: A.mono }}>
                                        <span title={`Guild ID: ${r.guild_id}`}>{guildLabel}</span>
                                        {' · '}
                                        {expired ? '⏹ Süresi doldu' : `⏳ ${timeAgo(r.expiry_timestamp)} kaldı`}
                                        {' · '}{formatExpiry(r.expiry_timestamp)}
                                    </div>
                                </div>
                                <Pill color={expired ? A.faint : A.ok}
                                    bg={expired ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.10)'}>
                                    {expired ? 'DOLDU' : 'AKTİF'}
                                </Pill>
                                <button onClick={() => delRoleMutation.mutate(i)}
                                    style={{ ...btnGhost, padding: '4px 8px', color: A.err, borderColor: 'rgba(248,113,113,0.25)' }}>
                                    <I.Trash size={11}/>
                                </button>
                            </Row>
                        );
                    })
                )}
            </div>
        </>
    );
}

// ── RCON Kuyruğu ─────────────────────────────────────────────────────────────

function RconQueueTab({ queueData, queueLoading, clearQueueMutation, onRefresh }) {
    const queue = queueData?.queue || [];
    return (
        <>
            <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <I.Stack size={13} style={{ color: A.faint }}/>RCON Komut Kuyruğu
                    </div>
                    <div style={{ fontSize: 11, color: A.faint, marginTop: 2 }}>
                        Sunucu çevrimdışıyken birikmiş, henüz çalıştırılamamış komutlar.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={onRefresh} style={btnGhost}><I.Restart size={11}/></button>
                    {queue.length > 0 && (
                        <button onClick={() => clearQueueMutation.mutate()} disabled={clearQueueMutation.isPending}
                            style={{ ...btnGhost, color: A.err, borderColor: 'rgba(248,113,113,0.25)' }}>
                            <I.Trash size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                            {clearQueueMutation.isPending ? 'TEMİZLE...' : 'TEMİZLE'}
                        </button>
                    )}
                </div>
            </div>

            <div style={card}>
                {queueLoading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: A.faint, fontSize: 12 }}>Yükleniyor...</div>
                ) : queue.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: A.faint }}>
                        <I.Check size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                        <p style={{ margin: 0, fontSize: 12 }}>Kuyruk boş — tüm komutlar iletildi.</p>
                    </div>
                ) : queue.map((item, i) => (
                    <div key={i} style={{
                        padding: '12px 16px', borderBottom: i !== queue.length - 1 ? `1px solid ${A.border}` : 'none',
                    }}>
                        <div style={{ fontSize: 12, fontFamily: A.mono, color: A.text }}>{item.command}</div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10.5, color: A.faint, fontFamily: A.mono }}>
                            {item.server && <span>Sunucu: {item.server}</span>}
                            {item.attempts !== undefined && <span>Deneme: {item.attempts}</span>}
                            {item.timestamp && <span>{new Date(item.timestamp).toLocaleString('tr-TR')}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

// ── Durum Mesajları ──────────────────────────────────────────────────────────

function StatusMessagesTab({ statusMsgData, statusMsgLoading, addStatusMsgMutation, delStatusMsgMutation, onRefresh }) {
    const messages = statusMsgData?.messages || {};
    const serverNames = Object.keys(messages);
    const [serverName, setServerName] = useState('');
    const [newMsg, setNewMsg] = useState('');

    const effectiveServer = serverName.trim() || (serverNames[0] || '');

    return (
        <>
            <div style={{ ...card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <I.Chat size={13} style={{ color: A.faint }}/>Dönen Durum Mesajları
                    </div>
                    <button onClick={onRefresh} style={btnGhost}><I.Restart size={11}/></button>
                </div>
                <p style={{ fontSize: 11, color: A.faint, margin: '0 0 12px' }}>
                    Bot her 15 saniyede bu mesajlar arasında geçiş yapar. Aktif oyuncu sayısı da dahil edilir.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input type="text" value={serverName} onChange={e => setServerName(e.target.value)}
                        placeholder={serverNames[0] || "Sunucu adı (config.py'deki)"}
                        style={{ ...inputStyle, width: 160 }}/>
                    <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                        placeholder="Yeni durum mesajı..."
                        style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: A.sans }}
                        onKeyDown={e => { if (e.key === 'Enter' && effectiveServer && newMsg) addStatusMsgMutation.mutate({ serverName: effectiveServer, message: newMsg }, { onSuccess: () => setNewMsg('') }); }}/>
                    <button onClick={() => addStatusMsgMutation.mutate({ serverName: effectiveServer, message: newMsg }, { onSuccess: () => setNewMsg('') })}
                        disabled={addStatusMsgMutation.isPending || !effectiveServer || !newMsg.trim()}
                        style={btnPrimary}>
                        <I.Plus size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                        {addStatusMsgMutation.isPending ? 'EKLE...' : 'EKLE'}
                    </button>
                </div>
            </div>

            <div style={card}>
                {statusMsgLoading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: A.faint, fontSize: 12 }}>Yükleniyor...</div>
                ) : serverNames.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: A.faint }}>
                        <I.Chat size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                        <p style={{ margin: 0, fontSize: 12 }}>Durum mesajı yok. Yukarıdan ekleyebilirsiniz.</p>
                    </div>
                ) : serverNames.map(srv => (
                    <div key={srv}>
                        <div style={{
                            padding: '8px 16px', background: A.bgDeeper, borderBottom: `1px solid ${A.border}`,
                        }}>
                            <Cap style={{ fontFamily: A.mono }}>{srv}</Cap>
                        </div>
                        {(messages[srv] || []).map((msg, idx) => (
                            <Row key={idx} last={idx === messages[srv].length - 1}>
                                <span style={{ fontSize: 10.5, color: A.faint, fontFamily: A.mono, width: 20 }}>{idx + 1}.</span>
                                <span style={{ flex: 1, fontSize: 12, color: A.text }}>{msg}</span>
                                <button onClick={() => delStatusMsgMutation.mutate({ serverName: srv, index: idx })}
                                    style={{ ...btnGhost, padding: '4px 8px', color: A.err, borderColor: 'rgba(248,113,113,0.25)' }}>
                                    <I.Trash size={11}/>
                                </button>
                            </Row>
                        ))}
                    </div>
                ))}
            </div>
        </>
    );
}

// ── Gece Koruması ────────────────────────────────────────────────────────────

function NightGuardTab() {
    return (
        <>
            <div style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <I.Alert size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}/>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>Gece Koruması (Night Guard)</div>
                        <p style={{ fontSize: 12, color: A.dim, margin: '4px 0 0', lineHeight: 1.6 }}>
                            Belirlenen saatler arasında admin veya korumalı rollere mention atan kullanıcıları
                            otomatik timeout'a alır. İhlal sayısına göre süre artar.
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div style={{ ...card, padding: 14 }}>
                    <Cap style={{ display: 'block', marginBottom: 10 }}>AKTİF SAATLER</Cap>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 4,
                            background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.20)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
                        }}>
                            <I.Clock size={16}/>
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: A.text, fontFamily: A.mono }}>00:00 – 08:00</div>
                            <div style={{ fontSize: 10.5, color: A.faint, marginTop: 2 }}>İstanbul Saati (UTC+3)</div>
                        </div>
                    </div>
                </div>

                <div style={{ ...card, padding: 14 }}>
                    <Cap style={{ display: 'block', marginBottom: 10 }}>TIMEOUT KADEMESİ</Cap>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[
                            { n: '1. ihlal',  dur: '1 dakika'  },
                            { n: '2. ihlal',  dur: '5 dakika'  },
                            { n: '3. ihlal',  dur: '15 dakika' },
                            { n: '4.+ ihlal', dur: '30 dakika' },
                        ].map(({ n, dur }) => (
                            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: A.faint }}>{n}</span>
                                <span style={{ color: A.text, fontWeight: 500, fontFamily: A.mono }}>{dur}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ ...card, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <I.Alert size={14} style={{ color: A.warn, flexShrink: 0, marginTop: 2 }}/>
                <div style={{ fontSize: 11, color: A.dim, lineHeight: 1.6 }}>
                    İhlal sayacı her gün otomatik sıfırlanır. Koruma konfigürasyonu bot'un
                    {' '}<code style={{ background: A.bgDeeper, padding: '2px 5px', borderRadius: 2, color: A.text, fontFamily: A.mono }}>config.py</code>
                    {' '}dosyasından yönetilir.
                </div>
            </div>
        </>
    );
}

// ── Webhook ──────────────────────────────────────────────────────────────────

const ALL_EVENTS = [
    { key: 'server_start',  label: 'Sunucu Başladı',  emoji: '🟢' },
    { key: 'server_stop',   label: 'Sunucu Durdu',    emoji: '🔴' },
    { key: 'server_crash',  label: 'Sunucu Çöktü',    emoji: '💥' },
    { key: 'player_join',   label: 'Oyuncu Girdi',    emoji: '👋' },
    { key: 'player_leave',  label: 'Oyuncu Ayrıldı',  emoji: '🚶' },
];

function WebhookTab() {
    const qc = useQueryClient();

    const { data: cfg, isLoading } = useQuery({
        queryKey: ['webhook-config'],
        queryFn: () => api.get('/discord/webhook-config').then(r => r.data),
    });

    const [url, setUrl] = useState('');
    const [events, setEvents] = useState(ALL_EVENTS.map(e => e.key));
    const [dirty, setDirty] = useState(false);

    // ✅ cfg yüklendiğinde local state'i senkronla (useEffect, useState değil!)
    useEffect(() => {
        if (!cfg) return;
        setUrl(cfg.url || '');
        setEvents(cfg.events && cfg.events.length > 0 ? cfg.events : ALL_EVENTS.map(e => e.key));
        setDirty(false);
    }, [cfg]);

    const saveMutation = useMutation({
        mutationFn: () => api.put('/discord/webhook-config', { url, events }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['webhook-config'] });
            toast.success('Webhook kaydedildi');
            setDirty(false);
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const testMutation = useMutation({
        mutationFn: () => api.post('/discord/webhook-test'),
        onSuccess: () => toast.success('Test mesajı gönderildi ✓'),
        onError: (e) => toast.error(e.response?.data?.error || 'Gönderilemedi'),
    });

    const toggleEvent = (key) => {
        setDirty(true);
        setEvents(prev => prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]);
    };

    const isValidUrl = url.startsWith('https://discord.com/api/webhooks/') ||
                       url.startsWith('https://discordapp.com/api/webhooks/');

    return (
        <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <I.Send size={15} style={{ color: 'var(--accent)' }}/>
                    <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>Discord Webhook Bildirimleri</div>
                    {cfg?.url && (
                        <Pill color={A.ok} bg="rgba(74,222,128,0.10)" style={{ marginLeft: 'auto' }}>
                            <Dot color={A.ok} size={5}/>BAĞLI
                        </Pill>
                    )}
                </div>
                <p style={{ fontSize: 11.5, color: A.dim, margin: 0 }}>
                    Seçtiğiniz olaylar gerçekleştiğinde bir Discord kanalına otomatik mesaj gönderir.
                </p>
            </div>

            {/* URL */}
            <div>
                <Cap style={{ display: 'block', marginBottom: 6 }}>WEBHOOK URL</Cap>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        type="url"
                        value={url}
                        onChange={e => { setUrl(e.target.value); setDirty(true); }}
                        placeholder="https://discord.com/api/webhooks/..."
                        style={{ ...inputStyle, flex: 1 }}
                        disabled={isLoading}
                    />
                    <button onClick={() => testMutation.mutate()}
                        disabled={testMutation.isPending || !cfg?.url || dirty}
                        title={dirty ? 'Önce kaydet' : !cfg?.url ? 'URL kaydedilmemiş' : 'Test mesajı gönder'}
                        style={{ ...btnGhost, opacity: (!cfg?.url || dirty) ? 0.5 : 1 }}>
                        <I.Play size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                        {testMutation.isPending ? 'TEST...' : 'TEST'}
                    </button>
                </div>
                {url && !isValidUrl && (
                    <div style={{ fontSize: 11, color: A.warn, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <I.Alert size={12}/>URL bir Discord webhook URL'si değil gibi görünüyor.
                    </div>
                )}
                <p style={{ fontSize: 11, color: A.faint, margin: '6px 0 0' }}>
                    Discord kanalı → Entegrasyonlar → Webhook oluştur → URL kopyala
                </p>
            </div>

            {/* Olay seçimi */}
            <div>
                <Cap style={{ display: 'block', marginBottom: 8 }}>BİLDİRİM OLAYLARI</Cap>
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6,
                }}>
                    {ALL_EVENTS.map(evt => {
                        const enabled = events.includes(evt.key);
                        return (
                            <button key={evt.key} onClick={() => toggleEvent(evt.key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 12px', borderRadius: 4,
                                    background: enabled ? 'rgba(167,139,250,0.08)' : A.bg,
                                    border: `1px solid ${enabled ? 'rgba(167,139,250,0.35)' : A.border}`,
                                    color: enabled ? A.text : A.faint,
                                    fontSize: 12, cursor: 'pointer', textAlign: 'left',
                                    fontFamily: A.sans, fontWeight: 500,
                                    transition: 'all 120ms',
                                }}>
                                <span style={{ fontSize: 14 }}>{evt.emoji}</span>
                                <span style={{ flex: 1 }}>{evt.label}</span>
                                {enabled && <I.Check size={12} style={{ color: 'var(--accent)' }}/>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Kaydet */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', borderTop: `1px solid ${A.border}`, paddingTop: 14 }}>
                {dirty && (
                    <span style={{ fontSize: 11, color: A.warn, marginRight: 'auto' }}>
                        ● Kaydedilmemiş değişiklikler var
                    </span>
                )}
                <button onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !dirty}
                    style={{ ...btnPrimary, opacity: !dirty ? 0.5 : 1 }}>
                    <I.Check size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>
                    {saveMutation.isPending ? 'KAYDET...' : 'KAYDET'}
                </button>
            </div>
        </div>
    );
}
