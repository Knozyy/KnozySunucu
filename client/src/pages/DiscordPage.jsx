import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnGhost, btnPrimary } from '@/hoodoo/tokens';
import { Cap, Dot, Pill } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

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

    // Roller Discord sunucusundan CANLI çekilir (manuel "kayıtlı rol" yerine).
    // botSettings.savedRoles bu canlı listeyle override edilir; böylece tüm rol
    // seçicileri (Süreli Roller, Bağış, Ayarlar) gerçek sunucu rollerini gösterir.
    const { data: liveRolesData } = useQuery({
        queryKey: ['discord-guild-roles'],
        queryFn: () => api.get('/vip/roles').then(r => r.data),
        staleTime: 60000,
    });
    const settingsWithRoles = useMemo(() => {
        const live = liveRolesData?.roles || [];
        if (!live.length) return botSettings;
        return { ...botSettings, savedRoles: live };
    }, [botSettings, liveRolesData]);

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


    const { data: historyData } = useQuery({
        queryKey: ['discord-history'],
        queryFn: () => api.get('/discord/player-history').then(r => r.data),
        enabled: activeTab === 'graph',
    });

    const { data: mcStatus } = useQuery({
        queryKey: ['minecraft-status'],
        queryFn: () => api.get('/minecraft/status?serverId=1').then(r => r.data).catch(() => null),
        refetchInterval: 10000,
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
        onSuccess: () => {
            toast.success('Bot ayarı kaydedildi. Bot yeniden başlatılınca geçerli olur.');
            queryClient.invalidateQueries({ queryKey: ['discord-bot-settings'] });
            queryClient.invalidateQueries({ queryKey: ['discord-guild-roles'] });
        },
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
        { key: 'donations',       label: 'Bağış Sistemi',    icon: I.Heart },
        { key: 'rcon-queue',      label: 'RCON Kuyruğu',     icon: I.Stack },
        { key: 'night-guard',     label: 'Gece Koruması',    icon: I.Alert },
        { key: 'webhook',         label: 'Webhook',          icon: I.Send },
        { key: 'settings',        label: 'Ayarlar (Bot Yetki & Kanallar)', icon: I.Cog },
        { key: 'test-actions',    label: 'Test İşlemleri',   icon: I.Play },
    ];

    return (
        <div style={{
            padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text,
        }}>
            <style>{`@keyframes hoodoo-spin{to{transform:rotate(360deg)}}`}</style>

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
                                animation: 'hoodoo-spin 0.8s linear infinite',
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

            {/* ── Aktif Oyuncular (Minecraft) ── */}
            <div style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'rgba(22, 163, 74, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A'
                    }}>
                        <I.Users size={16}/>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>Aktif Minecraft Oyuncuları</div>
                        <div style={{ fontSize: 11, color: A.faint }}>
                            {mcStatus?.status === 'running' ? `${mcStatus?.players?.length || 0} / ${mcStatus?.maxPlayers || 20} Oyuncu` : 'Sunucu Kapalı'}
                        </div>
                    </div>
                </div>
                
                <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {mcStatus?.status === 'running' ? (
                        mcStatus?.players?.length > 0 ? (
                            mcStatus.players.map(p => (
                                <div key={p} style={{
                                    padding: '4px 10px', background: A.bg, border: `1px solid ${A.border}`,
                                    borderRadius: 99, fontSize: 11, fontWeight: 500, fontFamily: A.mono
                                }}>
                                    {p}
                                </div>
                            ))
                        ) : (
                            <div style={{ fontSize: 11, color: A.faint }}>Şu an sunucuda kimse yok.</div>
                        )
                    ) : (
                        <div style={{ fontSize: 11, color: A.faint }}>Sunucu kapalı olduğu için oyuncu listesi yok.</div>
                    )}
                </div>
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
                    addRoleMutation={addRoleMutation} delRoleMutation={delRoleMutation}
                    botSettings={settingsWithRoles} botSettingsMutation={botSettingsMutation} />
            )}

            {/* ══ Bağış Sistemi ══ */}
            {activeTab === 'donations' && <DonationsTab botSettings={settingsWithRoles} botSettingsMutation={botSettingsMutation}/>}

            {/* ══ RCON Kuyruğu ══ */}
            {activeTab === 'rcon-queue' && (
                <RconQueueTab queueData={queueData} queueLoading={queueLoading}
                    clearQueueMutation={clearQueueMutation}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['discord-rcon-queue'] })}/>
            )}


            {/* ══ Gece Koruması ══ */}
            {activeTab === 'night-guard' && <NightGuardTab botSettings={botSettings} botSettingsMutation={botSettingsMutation}/>}

            {/* ══ Webhook ══ */}
            {activeTab === 'webhook' && <WebhookTab/>}

            {/* ══ Ayarlar ══ */}
            {activeTab === 'settings' && <SettingsTab botSettings={settingsWithRoles} botSettingsMutation={botSettingsMutation}/>}

            {/* ══ Test İşlemleri ══ */}
            {activeTab === 'test-actions' && <TestActionsTab/>}
        </div>
    );
}

// ── Bağış Sistemi Sekmesi ────────────────────────────────────────────────────

const DEFAULT_DONATION_CONFIG = {
    enabled: false,
    donateListUrl: '',
    publicDonateUrl: '',
    codePrefix: 'HOODOO',
    claimTtlHours: 72,
    minNotifyAmount: 50,
    incentivePercent: 0,
    donationLogChannelId: '',
    packages: [],
};

function fieldLabel(text) {
    return <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>{text}</div>;
}
function fieldHint(text) {
    return <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>{text}</div>;
}

function DonationPackageItem({ p, index, liveGuilds, setPkg, delPkg, vipPackages, savedRoles }) {
    // Seçilen sunucunun canlı rollerini çek
    const { data: liveRolesData } = useQuery({
        queryKey: ['discord-live-roles', p.guildId],
        queryFn: () => api.get(`/discord/guilds/${p.guildId}/roles`).then(r => r.data),
        enabled: !!p.guildId,
    });
    const liveRoles = liveRolesData?.roles || [];
    const rolesList = liveRoles.length ? liveRoles : (p.guildId ? [] : savedRoles);

    return (
        <div style={{ ...card, background: A.bg, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>{p.id}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: A.faint, cursor: 'pointer', marginLeft: 'auto' }}>
                    <input type="checkbox" checked={!!p.stackable} onChange={e => setPkg(index, 'stackable', e.target.checked)}/>
                    Katlanabilir (2× destek → 2× süre)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: A.faint, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!p.enabled} onChange={e => setPkg(index, 'enabled', e.target.checked)}/>
                    Aktif
                </label>
                <button onClick={() => delPkg(index)} title="Paketi sil"
                    style={{ ...btnGhost, padding: '4px 8px', color: '#f87171' }}>
                    <I.Trash size={13}/>
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                    {fieldLabel('Paket Adı')}
                    <input type="text" value={p.label} onChange={e => setPkg(index, 'label', e.target.value)}
                        placeholder="Örn: Sunucu Katılım Üyeliği (30 gün)" style={inputStyle}/>
                </div>
                <div>
                    {fieldLabel('Tür')}
                    <select value={p.type} onChange={e => {
                        setPkg(index, 'type', e.target.value);
                        if (e.target.value === 'vip') {
                            setPkg(index, 'guildId', '');
                            setPkg(index, 'roleId', '');
                        }
                    }} style={inputStyle}>
                        <option value="timed_role">Süreli Rol</option>
                        <option value="vip">VIP Paketi</option>
                    </select>
                </div>
                <div>
                    {fieldLabel('Min. Destek (₺)')}
                    <input type="number" min="1" value={p.price} onChange={e => setPkg(index, 'price', e.target.value)} style={inputStyle}/>
                </div>
            </div>

            {p.type === 'timed_role' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', gap: 10 }}>
                    <div>
                        {fieldLabel('Sunucu (Guild)')}
                        <select value={p.guildId || ''} onChange={e => {
                            setPkg(index, 'guildId', e.target.value);
                            setPkg(index, 'roleId', '');
                        }} style={inputStyle}>
                            <option value="">-- Varsayılan Sunucu --</option>
                            {liveGuilds.map(g => (
                                <option key={g.id} value={g.id}>
                                    {g.name} ({g.id})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        {fieldLabel('Discord Rolü')}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <select value={rolesList.some(r => String(r.id) === String(p.roleId)) ? p.roleId : ''}
                                onChange={e => e.target.value && setPkg(index, 'roleId', e.target.value)}
                                style={{ ...inputStyle, width: '50%' }}>
                                <option value="">Kayıtlı rollerden seç...</option>
                                {rolesList.map(r => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
                            </select>
                            <input type="text" value={p.roleId} onChange={e => setPkg(index, 'roleId', e.target.value)}
                                placeholder="veya Rol ID yapıştır" style={{ ...inputStyle, width: '50%' }}/>
                        </div>
                        {fieldHint('Aynı rol tekrar alınırsa süre üst üste eklenir (uzatma).')}
                    </div>
                    <div>
                        {fieldLabel('Süre (gün)')}
                        <input type="number" min="1" value={p.durationDays}
                            onChange={e => setPkg(index, 'durationDays', e.target.value)} style={inputStyle}/>
                    </div>
                </div>
            ) : (
                <div>
                    {fieldLabel('Panel VIP Paketi')}
                    <select value={p.vipPackageId} onChange={e => setPkg(index, 'vipPackageId', e.target.value)} style={inputStyle}>
                        <option value="">VIP paketi seç...</option>
                        {vipPackages.map(vp => (
                            <option key={vp.id} value={vp.id}>
                                {vp.name} ({vp.duration_days > 0 ? `${vp.duration_days} gün` : 'süresiz'})
                            </option>
                        ))}
                    </select>
                    {fieldHint('Süre ve roller VIP sayfasındaki paketten gelir. Aynı paket tekrar alınırsa süre uzatılır; daha değerli pakete geçişte kalan süre orana göre yeni pakete aktarılır.')}
                </div>
            )}
        </div>
    );
}

function DonationsTab({ botSettings, botSettingsMutation }) {
    const [form, setForm] = useState(DEFAULT_DONATION_CONFIG);

    const { data: vipData } = useQuery({
        queryKey: ['vip-packages'],
        queryFn: () => api.get('/vip/packages').then(r => r.data),
    });
    const vipPackages = vipData?.packages || [];
    const savedRoles = botSettings?.savedRoles || [];

    // Canlı sunucu listesini çek
    const { data: liveGuildsData } = useQuery({
        queryKey: ['discord-live-guilds'],
        queryFn: () => api.get('/discord/guilds').then(r => r.data),
    });
    const liveGuilds = liveGuildsData?.guilds || [];

    useEffect(() => {
        if (botSettings?.donation_config) {
            setForm({
                ...DEFAULT_DONATION_CONFIG,
                ...botSettings.donation_config,
                packages: botSettings.donation_config.packages || [],
            });
        }
    }, [botSettings]);

    const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const setPkg = (i, key, value) => setForm(f => {
        const packages = [...f.packages];
        packages[i] = { ...packages[i], [key]: value };
        return { ...f, packages };
    });
    const addPkg = () => setForm(f => ({
        ...f,
        packages: [...f.packages, {
            id: 'pkg_' + Date.now().toString(36),
            label: '', type: 'timed_role', guildId: '', roleId: '', vipPackageId: '',
            durationDays: 30, price: 100, stackable: true, enabled: true,
        }],
    }));
    const delPkg = (i) => setForm(f => ({ ...f, packages: f.packages.filter((_, idx) => idx !== i) }));

    const save = () => {
        const invalid = form.packages.find(p =>
            !p.label.trim() ||
            !(Number(p.price) > 0) ||
            (p.type === 'timed_role' && (!p.roleId || !(Number(p.durationDays) > 0))) ||
            (p.type === 'vip' && !p.vipPackageId)
        );
        if (invalid) {
            toast.error('Eksik paket alanı var: isim, tutar ve rol/VIP paketi zorunlu.');
            return;
        }
        botSettingsMutation.mutate({
            donation_config: {
                ...form,
                claimTtlHours: Number(form.claimTtlHours) || 72,
                minNotifyAmount: Number(form.minNotifyAmount) || 0,
                incentivePercent: Number(form.incentivePercent) || 0,
                codePrefix: (form.codePrefix || 'HOODOO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'HOODOO',
                packages: form.packages.map(p => ({
                    ...p,
                    price: Number(p.price) || 0,
                    durationDays: Number(p.durationDays) || 0,
                    vipPackageId: p.vipPackageId ? Number(p.vipPackageId) : '',
                })),
            },
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── ByNoGame kural uyarısı ── */}
            <div style={{ ...card, padding: '12px 16px', borderColor: 'rgba(245,158,11,0.35)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <I.Alert size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }}/>
                <div style={{ fontSize: 11.5, color: A.faint, lineHeight: 1.5 }}>
                    ByNoGame sözleşmesi (Madde 7.2.d) donate sisteminin <b>ticari amaçla</b> kullanımını yasaklar.
                    Bu sistem "satış" değil, <b>destekçilere teşekkür avantajı</b> olarak sunulmalıdır.
                    Duyurularda "satın al / fiyat" yerine "destek ol / teşekkür hediyesi" dili kullanın.
                </div>
            </div>

            {/* ── Genel Ayarlar ── */}
            <div style={{ ...card, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Cap>Bağış Sistemi Ayarları</Cap>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: A.text }}>
                        <input type="checkbox" checked={!!form.enabled} onChange={e => set('enabled', e.target.checked)}/>
                        Sistem Aktif
                    </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        {fieldLabel('ByNoGame Donate Liste Linki (bot bunu okur)')}
                        <input type="text" value={form.donateListUrl} onChange={e => set('donateListUrl', e.target.value)}
                            placeholder="https://donate.bynogame.com/donatelist/xxxxxxxx-xxxx-..." style={inputStyle}/>
                        {fieldHint('ByNoGame panelindeki "Donate Listem" sayfasının linki. Bot 2 dakikada bir bu sayfadan yeni bağışları okur.')}
                    </div>
                    <div>
                        {fieldLabel('Herkese Açık Bağış Sayfası (kullanıcılar burada bağış yapar)')}
                        <input type="text" value={form.publicDonateUrl} onChange={e => set('publicDonateUrl', e.target.value)}
                            placeholder="https://donate.bynogame.com/kullanici-adi" style={inputStyle}/>
                        {fieldHint('/bagis komutundaki "Bağış Yap" butonu bu adrese yönlendirir.')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                        <div>
                            {fieldLabel('Teşvik Bonusu (%)')}
                            <input type="number" min="0" max="100" value={form.incentivePercent}
                                onChange={e => set('incentivePercent', e.target.value)} style={inputStyle}/>
                            {fieldHint('Örn. %10 → 30 gün yerine 33 gün verilir.')}
                        </div>
                        <div>
                            {fieldLabel('Marka Kelimesi')}
                            <input type="text" value={form.codePrefix} onChange={e => set('codePrefix', e.target.value)}
                                placeholder="HOODOO" style={inputStyle}/>
                            {fieldHint('Kod bu kelime + doğal bir takıdan oluşur (örn. "hoodoo kavemi") — satın alma kodu gibi durmaz.')}
                        </div>
                        <div>
                            {fieldLabel('Kod Geçerliliği (saat)')}
                            <input type="number" min="1" value={form.claimTtlHours}
                                onChange={e => set('claimTtlHours', e.target.value)} style={inputStyle}/>
                            {fieldHint('/bagis ile alınan kodun ömrü.')}
                        </div>
                        <div>
                            {fieldLabel('Bildirim Alt Limiti (₺)')}
                            <input type="number" min="0" value={form.minNotifyAmount}
                                onChange={e => set('minNotifyAmount', e.target.value)} style={inputStyle}/>
                            {fieldHint('Kodsuz bağışlar bu tutarın üstündeyse log kanalına düşer.')}
                        </div>
                    </div>
                    <div>
                        {fieldLabel('Bağış Log Kanalı ID (opsiyonel)')}
                        <input type="text" value={form.donationLogChannelId} onChange={e => set('donationLogChannelId', e.target.value)}
                            placeholder="Boşsa Süreli Rol log kanalı kullanılır" style={inputStyle}/>
                        {fieldHint('Eşleşen ve eşleşmeyen bağış bildirimleri bu kanala gönderilir.')}
                    </div>
                </div>
            </div>

            {/* ── Paketler ── */}
            <div style={{ ...card, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Cap>Destek Paketleri</Cap>
                    <button onClick={addPkg} style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <I.Plus size={13}/> Paket Ekle
                    </button>
                </div>

                {form.packages.length === 0 && (
                    <div style={{ fontSize: 12, color: A.faint, padding: '12px 0' }}>
                        Henüz paket yok. "Paket Ekle" ile başlayın — örn. Sunucu Katılım Üyeliği (süreli rol) veya VIP kademesi.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {form.packages.map((p, i) => (
                        <DonationPackageItem
                            key={p.id}
                            p={p}
                            index={i}
                            liveGuilds={liveGuilds}
                            setPkg={setPkg}
                            delPkg={delPkg}
                            vipPackages={vipPackages}
                            savedRoles={savedRoles}
                        />
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={save} disabled={botSettingsMutation.isPending}
                    style={{ ...btnPrimary, opacity: botSettingsMutation.isPending ? 0.6 : 1 }}>
                    {botSettingsMutation.isPending ? 'Kaydediliyor...' : 'Bağış Ayarlarını Kaydet'}
                </button>
            </div>
        </div>
    );
}

// ── Ayarlar Sekmesi ──────────────────────────────────────────────────────────

function MultiRoleInput({ value, onChange, savedRoles, placeholder }) {
    const [inputValue, setInputValue] = useState('');
    const [preset, setPreset] = useState('');

    const handleAdd = (idToAdd) => {
        const id = idToAdd.trim();
        if (!id) return;
        if (!value.includes(id)) {
            onChange([...value, id]);
        }
        setInputValue('');
        setPreset('');
    };

    const handleRemove = (id) => {
        onChange(value.filter(v => v !== id));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: value.length > 0 ? 28 : 0 }}>
                {value.length === 0 && <span style={{ fontSize: 12, color: 'var(--faint)' }}>Henüz eklenmemiş.</span>}
                {value.map(id => {
                    const saved = savedRoles.find(r => String(r.id) === String(id));
                    const label = saved ? `${saved.name} (${id})` : id;
                    return (
                        <div key={id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', background: 'rgba(167, 139, 250, 0.10)',
                            border: '1px solid rgba(167, 139, 250, 0.25)', borderRadius: 99,
                            fontSize: 12, fontWeight: 500, color: 'var(--accent)'
                        }}>
                            {label}
                            <button onClick={() => handleRemove(id)} style={{
                                background: 'none', border: 'none', color: 'inherit',
                                cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.6
                            }}>✕</button>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(inputValue); }}
                    placeholder={placeholder || "Rol ID girin ve Enter'a basın..."}
                    style={{ ...inputStyle, flex: 1, minWidth: 200 }}/>
                {savedRoles && savedRoles.length > 0 && (
                    <select value={preset} onChange={e => handleAdd(e.target.value)} style={{ ...inputStyle, width: 220 }}>
                        <option value="">Kayıtlı Rol Seç & Ekle...</option>
                        {savedRoles.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                        ))}
                    </select>
                )}
                <button onClick={() => handleAdd(inputValue)} style={btnPrimary} disabled={!inputValue.trim()}>EKLE</button>
            </div>
        </div>
    );
}

// ── Tek-tıkla whitelist senkronizasyon butonu ────────────────────────────────
function SyncWhitelistButton() {
    const syncMutation = useMutation({
        mutationFn: () => api.post('/discord/sync-whitelist-to-mc').then(r => r.data),
        onSuccess: (data) => {
            toast.success(data.message || 'Whitelist senkronize edildi');
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Senkronizasyon başarısız'),
    });

    const handleSync = () => {
        if (confirm('Paneldeki whitelist Minecraft sunucusunun whitelist.json dosyasına yazılacak. Devam edilsin mi?')) {
            syncMutation.mutate();
        }
    };

    const data = syncMutation.data;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={handleSync} disabled={syncMutation.isPending}
                style={{
                    ...btnPrimary, padding: '10px 18px', alignSelf: 'flex-start',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    opacity: syncMutation.isPending ? 0.6 : 1,
                }}>
                <I.Upload size={12}/>
                {syncMutation.isPending ? 'AKTARILIYOR...' : 'WHİTELİST\'İ MINECRAFT\'A AKTAR'}
            </button>

            {/* Son senkronizasyon özeti */}
            {data && (
                <div style={{
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    borderRadius: 4, padding: '10px 12px',
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 8, fontSize: 11, fontFamily: A.mono,
                }}>
                    <div>
                        <span style={{ color: A.faint }}>EKLENDİ</span><br/>
                        <span style={{ color: A.ok, fontSize: 14, fontWeight: 600 }}>{data.added?.length ?? 0}</span>
                    </div>
                    <div>
                        <span style={{ color: A.faint }}>GÜNCELLENDİ</span><br/>
                        <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>{data.updated?.length ?? 0}</span>
                    </div>
                    <div>
                        <span style={{ color: A.faint }}>DEĞİŞMEDİ</span><br/>
                        <span style={{ color: A.dim, fontSize: 14, fontWeight: 600 }}>{data.unchanged?.length ?? 0}</span>
                    </div>
                    {data.failed?.length > 0 && (
                        <div>
                            <span style={{ color: A.faint }}>BAŞARISIZ</span><br/>
                            <span style={{ color: A.err, fontSize: 14, fontWeight: 600 }} title={data.failed.join(', ')}>
                                {data.failed.length}
                            </span>
                        </div>
                    )}
                    <div style={{ gridColumn: '1 / -1', color: A.faint, paddingTop: 6, borderTop: `1px solid ${A.border}` }}>
                        {data.reloaded
                            ? '✓ Sunucuya whitelist reload komutu gönderildi'
                            : '⚠ Sunucu kapalı — dosyaya yazıldı, başlatınca etkin olur'}
                    </div>
                    {data.failed?.length > 0 && (
                        <div style={{ gridColumn: '1 / -1', color: A.err, fontSize: 10 }}>
                            Çözülemeyen nick'ler (Mojang API): {data.failed.join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SettingsTab({ botSettings, botSettingsMutation }) {
    const [form, setForm] = useState({
        default_guild_id: '',
        adminRoleIds: [],
        whitelistRoleIds: [],
        whitelistAddRoleIds: [],
        whitelist_required_role_ids: [],
        dashboard_channel_id: '',
        dashboard_update_interval: '1',
        whitelist_channel_id: '',
        role_log_channel_id: '',
        night_guard_log_channel_id: ''
    });

    // Canlı sunucu listesini çek
    const { data: liveGuildsData } = useQuery({
        queryKey: ['discord-live-guilds-settings'],
        queryFn: () => api.get('/discord/guilds').then(r => r.data),
    });
    const liveGuilds = liveGuildsData?.guilds || [];

    const syncMutation = useMutation({
        mutationFn: async () => {
            await api.post('/api/discord/sync-settings');
        },
        onSuccess: () => toast.success('Ayarlar bota zorla (force) senkronize edildi!'),
        onError: (err) => toast.error(err.response?.data?.error || 'Senkronizasyon hatası')
    });

    const getArray = (val) => Array.isArray(val) ? val : (typeof val === 'string' && val ? val.split(',') : []);

    useEffect(() => {
        if (botSettings) {
            setForm({
                default_guild_id: botSettings.default_guild_id || '',
                adminRoleIds: getArray(botSettings.adminRoleIds),
                whitelistRoleIds: getArray(botSettings.whitelistRoleIds),
                whitelistAddRoleIds: getArray(botSettings.whitelistAddRoleIds),
                whitelist_required_role_ids: getArray(botSettings.whitelist_required_role_ids),
                dashboard_channel_id: botSettings.dashboard_channel_id || '',
                dashboard_update_interval: botSettings.dashboard_update_interval || '1',
                whitelist_channel_id: botSettings.whitelist_channel_id || '',
                role_log_channel_id: botSettings.role_log_channel_id || '',
                night_guard_log_channel_id: botSettings.night_guard_log_channel_id || ''
            });
        }
    }, [botSettings]);

    const handleChange = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const handleArrayChange = (key, value) => {
        const arr = value.split(',').map(s => s.trim()).filter(Boolean);
        setForm(f => ({ ...f, [key]: arr }));
    };

    const handleSave = () => {
        botSettingsMutation.mutate(form);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...card, padding: 20 }}>
                <Cap style={{ display: 'block', marginBottom: 16 }}>Bot Yetki & Rol Ayarları</Cap>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Varsayılan Discord Sunucusu (Guild)</div>
                        <select value={form.default_guild_id} onChange={e => handleChange('default_guild_id', e.target.value)} style={inputStyle}>
                            <option value="">-- Listeden Seçin veya Varsayılan Kalsın --</option>
                            {liveGuilds.map(g => (
                                <option key={g.id} value={g.id}>{g.name} ({g.id})</option>
                            ))}
                        </select>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>
                            Rolle alakalı tüm canlı sorgular (yetkili rolleri, whitelist rolleri vb.) varsayılan olarak bu sunucudan çekilecektir.
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Tam Yetkili (Admin) Rolleri</div>
                        <MultiRoleInput value={form.adminRoleIds} onChange={v => handleChange('adminRoleIds', v)} savedRoles={botSettings?.savedRoles || []} />
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Bu rollere sahip kişiler botun tüm özelliklerine kısıtlamasız erişebilir. Sadece güvendiğiniz yöneticilere verin.</div>
                    </div>
                    
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Whitelist Listesini Görebilen Roller</div>
                        <MultiRoleInput value={form.whitelistRoleIds} onChange={v => handleChange('whitelistRoleIds', v)} savedRoles={botSettings?.savedRoles || []} />
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Bu role sahip olan moderatörler sadece onaylı oyuncu listesini görüntüleyebilir, ekleme yapamaz.</div>
                    </div>
                    
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Whitelist'e Oyuncu Ekleyebilen Roller</div>
                        <MultiRoleInput value={form.whitelistAddRoleIds} onChange={v => handleChange('whitelistAddRoleIds', v)} savedRoles={botSettings?.savedRoles || []} />
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Bu role sahip olan yetkililer whitelist komutuyla oyuna yeni oyuncuları ekleyebilir.</div>
                    </div>

                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Oyuncularda Zorunlu Olan 'Whitelist' Rolü</div>
                        <MultiRoleInput value={form.whitelist_required_role_ids} onChange={v => handleChange('whitelist_required_role_ids', v)} savedRoles={botSettings?.savedRoles || []} />
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Gece 00:00'da yapılan rutin temizlikte, <b>bu role (veya admin rolüne) sahip olmayan</b> herkes whitelist'ten silinir. Oyuncuların kaydının silinmemesi için seçili rollerden en az birine sahip olmaları gerekir.</div>
                    </div>
                </div>
            </div>

            <div style={{ ...card, padding: 20 }}>
                <Cap style={{ display: 'block', marginBottom: 16 }}>Kanal Ayarları (ID'leri Buraya Girin)</Cap>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Canlı Sunucu İstatistikleri Kanalı</div>
                        <input type="text" value={form.dashboard_channel_id} 
                            onChange={e => handleChange('dashboard_channel_id', e.target.value)} 
                            placeholder="Örn: 981273918237" style={inputStyle}/>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Bot, sunucunun aktif oyuncu sayısını ve online tablosunu bu kanala atar ve kendi kendine günceller.</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Dashboard Güncelleme Sıklığı (Dakika)</div>
                        <select value={form.dashboard_update_interval || "1"} 
                            onChange={e => handleChange('dashboard_update_interval', e.target.value)} 
                            style={inputStyle}>
                            <option value="1">1 Dakikada Bir (Hızlı)</option>
                            <option value="5">5 Dakikada Bir</option>
                            <option value="10">10 Dakikada Bir</option>
                            <option value="15">15 Dakikada Bir</option>
                            <option value="30">30 Dakikada Bir</option>
                            <option value="60">Saat Başı (60 Dk)</option>
                        </select>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>İstatistiklerin Discord üzerinde kaç dakikada bir yenileneceğini belirler.</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Whitelist Ekleme (Kayıt) Log Kanalı</div>
                        <input type="text" value={form.whitelist_channel_id} 
                            onChange={e => handleChange('whitelist_channel_id', e.target.value)} 
                            placeholder="Örn: 123456789" style={inputStyle}/>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Oyuncular whitelist'e kayıt edildiğinde bu kanala log (bildirim) mesajı gönderilir.</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Süreli Rol Bitiş Log Kanalı</div>
                        <input type="text" value={form.role_log_channel_id} 
                            onChange={e => handleChange('role_log_channel_id', e.target.value)} 
                            placeholder="Örn: 123456789" style={inputStyle}/>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Verilen süreli VIP/Özel rollerin zamanı dolup geri alındığında bu kanala bilgi düşer.</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>Gece Whitelist Temizliği Log Kanalı</div>
                        <input type="text" value={form.night_guard_log_channel_id} 
                            onChange={e => handleChange('night_guard_log_channel_id', e.target.value)} 
                            placeholder="Örn: 123456789" style={inputStyle}/>
                        <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Gece 00:00'da yapılan otomatik whitelist temizliğinde (rolü olmayanların silinmesi) sonucun raporlandığı kanaldır.</div>
                    </div>
                </div>
            </div>

            <div style={{ ...card, padding: 20 }}>
                <Cap style={{ display: 'block', marginBottom: 16 }}>Whitelist Aktarımı</Cap>
                <SyncWhitelistButton/>
                <div style={{ fontSize: 11, color: A.faint, marginTop: 10, lineHeight: 1.6 }}>
                    Paneldeki tüm kayıtlı oyuncuları Minecraft sunucusunun{' '}
                    <code style={{ background: A.bgDeeper, padding: '1px 5px', borderRadius: 2, color: A.text, fontFamily: A.mono }}>whitelist.json</code>{' '}
                    dosyasına <strong>doğrudan yazar</strong>. Sunucu kapalı olsa bile çalışır.
                    Sunucu açıksa otomatik olarak <code style={{ background: A.bgDeeper, padding: '1px 5px', borderRadius: 2, color: A.text, fontFamily: A.mono }}>whitelist reload</code> komutu gönderilir.
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button style={{ ...btnGhost, padding: '10px 24px', border: '1px solid var(--border)' }} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                    {syncMutation.isPending ? 'SENKRONİZE EDİLİYOR...' : 'BOTA SENKRONİZE ET'}
                </button>
                <button style={{ ...btnPrimary, padding: '10px 24px' }} onClick={handleSave} disabled={botSettingsMutation.isPending}>
                    {botSettingsMutation.isPending ? 'KAYDEDİLİYOR...' : 'AYARLARI KAYDET'}
                </button>
            </div>
        </div>
    );
}

// ── Süreli Roller ────────────────────────────────────────────────────────────

function TimedRolesTab({ rolesLoading, timedRoles, activeRoles, expiredRoles, now, addRoleMutation, delRoleMutation, botSettings, botSettingsMutation }) {
    const [form, setForm] = useState({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' });
    const [showForm, setShowForm] = useState(false);

    // Canlı sunucu listesini çek
    const { data: liveGuildsData } = useQuery({
        queryKey: ['discord-live-guilds'],
        queryFn: () => api.get('/discord/guilds').then(r => r.data),
        enabled: showForm, // Sadece form açıkken çeksin
    });
    const liveGuilds = liveGuildsData?.guilds || [];

    // Seçilen sunucunun canlı rollerini çek
    const { data: liveRolesData } = useQuery({
        queryKey: ['discord-live-roles', form.guild_id],
        queryFn: () => api.get(`/discord/guilds/${form.guild_id}/roles`).then(r => r.data),
        enabled: !!form.guild_id,
    });
    const liveRoles = liveRolesData?.roles || [];

    const savedGuilds = botSettings?.savedGuilds || [];
    const savedRoles = botSettings?.savedRoles || [];

    const guildsList = liveGuilds.length ? liveGuilds : savedGuilds;
    const rolesList = liveRoles.length ? liveRoles : (form.guild_id ? [] : savedRoles);

    const handleAdd = () => {
        addRoleMutation.mutate(form, {
            onSuccess: () => { setForm({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' }); setShowForm(false); },
        });
    };

    return (
        <>
            <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>{activeRoles.length} aktif · {expiredRoles.length} süresi dolmuş</Cap>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowForm(v => !v)} style={btnGhost}>
                        <I.Plus size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>YENİ EKLE
                    </button>
                </div>
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
                            <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Sunucu (Guild) Seçin veya Yazın</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <select style={{ ...inputStyle, flex: 1 }} value={form.guild_id} onChange={e => setForm(f => ({ ...f, guild_id: e.target.value, role_id: '' }))}>
                                    <option value="">-- Özel ID Girin --</option>
                                    {guildsList.map((g, i) => <option key={i} value={g.id}>{g.name} ({g.id})</option>)}
                                </select>
                                <input value={form.guild_id} onChange={e => setForm(f => ({ ...f, guild_id: e.target.value, role_id: '' }))}
                                    style={{ ...inputStyle, flex: 1 }} placeholder="ID yazın"/>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: A.faint, marginBottom: 4 }}>Rol Seçin veya Yazın</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <select style={{ ...inputStyle, flex: 1 }} value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                                    <option value="">-- Özel ID Girin --</option>
                                    {rolesList.map((r, i) => <option key={i} value={r.id}>{r.name} ({r.id})</option>)}
                                </select>
                                <input value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                                    style={{ ...inputStyle, flex: 1 }} placeholder="ID yazın"/>
                            </div>
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

// ── Gece Koruması ────────────────────────────────────────────────────────────

// Çoklu ID girdisi (chip listesi)
function MultiIdInput({ value, onChange, placeholder, idKind = 'kullanıcı' }) {
    const [text, setText] = useState('');

    const add = (raw) => {
        const id = String(raw || '').trim().replace(/[^0-9]/g, '');
        if (!id || id.length < 5) return;
        if (value.includes(id)) return;
        onChange([...value, id]);
        setText('');
    };

    const remove = (id) => onChange(value.filter(v => v !== id));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                minHeight: value.length > 0 ? 28 : 0,
            }}>
                {value.length === 0 && (
                    <span style={{ fontSize: 11, color: A.faint, fontStyle: 'italic' }}>
                        Henüz {idKind} eklenmemiş.
                    </span>
                )}
                {value.map(id => (
                    <div key={id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 8px', background: 'rgba(167,139,250,0.10)',
                        border: '1px solid rgba(167,139,250,0.25)', borderRadius: 99,
                        fontSize: 11, fontFamily: A.mono, color: 'var(--accent)',
                    }}>
                        {id}
                        <button onClick={() => remove(id)} style={{
                            background: 'none', border: 'none', color: 'inherit',
                            cursor: 'pointer', padding: 0, fontSize: 11, opacity: 0.7,
                        }}>✕</button>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
                    placeholder={placeholder} style={{ ...inputStyle, flex: 1 }}/>
                <button onClick={() => add(text)} disabled={!text.trim()} style={btnGhost}>
                    + EKLE
                </button>
            </div>
        </div>
    );
}

// Sayıyı 0-23 aralığına sığdırıp 2 haneli string'e çevir
const toHourStr = (n) => String(Math.max(0, Math.min(23, parseInt(n, 10) || 0))).padStart(2, '0');

function NightGuardTab({ botSettings, botSettingsMutation }) {
    const [enabled, setEnabled] = useState(false);
    const [startHour, setStartHour] = useState(0);
    const [endHour, setEndHour] = useState(8);
    const [protectedUserIds, setProtectedUserIds] = useState([]); // rahatsız edilemeyecek kişiler
    const [protectedRoleIds, setProtectedRoleIds] = useState([]); // korunan roller
    const [timeouts, setTimeouts] = useState({ first: 1, second: 5, third: 15, repeat: 30 });
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!botSettings?.nightGuard) return;
        const ng = botSettings.nightGuard;
        setEnabled(!!ng.enabled);
        setStartHour(ng.startHour ?? 0);
        setEndHour(ng.endHour ?? 8);

        // Backward compat: tek alandı, artık liste
        const pu = ng.protectedUserIds || (ng.adminId ? [ng.adminId] : []);
        setProtectedUserIds(Array.isArray(pu) ? pu.filter(Boolean) : []);

        const pr = ng.protectedRoleIds || (ng.protectedRoleId ? [ng.protectedRoleId] : []);
        setProtectedRoleIds(Array.isArray(pr) ? pr.filter(Boolean) : []);

        setTimeouts({
            first:  ng.timeouts?.first  ?? 1,
            second: ng.timeouts?.second ?? 5,
            third:  ng.timeouts?.third  ?? 15,
            repeat: ng.timeouts?.repeat ?? 30,
        });
        setDirty(false);
    }, [botSettings]);

    const markDirty = (fn) => (...args) => { fn(...args); setDirty(true); };

    const handleSave = () => {
        botSettingsMutation.mutate({
            nightGuard: {
                enabled,
                startHour: parseInt(startHour, 10) || 0,
                endHour:   parseInt(endHour, 10)   || 0,
                protectedUserIds,
                protectedRoleIds,
                timeouts: {
                    first:  parseInt(timeouts.first,  10) || 1,
                    second: parseInt(timeouts.second, 10) || 5,
                    third:  parseInt(timeouts.third,  10) || 15,
                    repeat: parseInt(timeouts.repeat, 10) || 30,
                },
                // Geriye dönük uyumluluk için eski alanları da yaz
                adminId: protectedUserIds[0] || '',
                protectedRoleId: protectedRoleIds[0] || '',
            }
        }, {
            onSuccess: () => setDirty(false)
        });
    };

    // Saat aralığı görsel açıklama
    const startStr = toHourStr(startHour);
    const endStr   = toHourStr(endHour);
    const wrapsMidnight = parseInt(endHour, 10) <= parseInt(startHour, 10);
    const rangeLabel = wrapsMidnight
        ? `${startStr}:00 → ertesi gün ${endStr}:00`
        : `${startStr}:00 – ${endStr}:00`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Başlık + Toggle ── */}
            <div style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <I.Alert size={20} style={{ color: enabled ? 'var(--accent)' : A.faint, flexShrink: 0, marginTop: 2 }}/>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>Gece Koruması (Night Guard)</div>
                            <p style={{ fontSize: 12, color: A.dim, margin: '4px 0 0', lineHeight: 1.6 }}>
                                Belirlenen saat aralığında, korumalı kişi veya rollere <strong>mention</strong> atan kullanıcıları otomatik timeout'a alır.
                                İhlal sayısına göre süre kademeli olarak artar.
                            </p>
                            {enabled && (
                                <div style={{ marginTop: 8, fontSize: 11, color: A.ok, fontFamily: A.mono }}>
                                    ● AKTİF — Her gün {rangeLabel} (İstanbul saati / UTC+3)
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={markDirty(() => setEnabled(!enabled))}
                        style={{
                            background: enabled ? 'var(--accent)' : A.bgDeeper,
                            border: `1px solid ${enabled ? 'var(--accent)' : A.border}`,
                            width: 36, height: 20, borderRadius: 10, position: 'relative',
                            cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
                        }}>
                        <div style={{
                            width: 14, height: 14, borderRadius: '50%', background: A.bg,
                            position: 'absolute', top: 2, left: enabled ? 18 : 2, transition: 'all 0.2s',
                        }}/>
                    </button>
                </div>
            </div>

            {/* ── Saat aralığı ── */}
            <div style={{ ...card, padding: 16 }}>
                <Cap style={{ display: 'block', marginBottom: 12 }}>Aktif Saat Aralığı</Cap>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 11, color: A.faint, marginBottom: 6 }}>Başlangıç</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min="0" max="23" value={startHour}
                                onChange={markDirty(e => setStartHour(e.target.value))}
                                style={{ ...inputStyle, width: 72, textAlign: 'center', fontSize: 18, padding: '8px 6px' }}/>
                            <span style={{ fontFamily: A.mono, color: A.faint }}>:00</span>
                        </div>
                    </div>
                    <span style={{ fontSize: 18, color: A.faintest, marginBottom: 8 }}>→</span>
                    <div>
                        <div style={{ fontSize: 11, color: A.faint, marginBottom: 6 }}>Bitiş</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min="0" max="23" value={endHour}
                                onChange={markDirty(e => setEndHour(e.target.value))}
                                style={{ ...inputStyle, width: 72, textAlign: 'center', fontSize: 18, padding: '8px 6px' }}/>
                            <span style={{ fontFamily: A.mono, color: A.faint }}>:00</span>
                        </div>
                    </div>
                    <div style={{
                        marginBottom: 4, fontSize: 12, fontFamily: A.mono, color: A.dim,
                        background: A.bgDeeper, padding: '8px 12px', borderRadius: 3,
                        border: `1px solid ${A.border}`,
                    }}>
                        {rangeLabel}
                    </div>
                </div>
                <p style={{ fontSize: 11, color: A.faint, margin: '10px 0 0' }}>
                    Bitiş başlangıçtan küçük veya eşitse aralık gece yarısını kapsar (örn. 23:00 → 07:00).
                </p>
            </div>

            {/* ── Korunan kişiler ── */}
            <div style={{ ...card, padding: 16 }}>
                <Cap style={{ display: 'block', marginBottom: 4 }}>Rahatsız Edilemeyecek Kişiler</Cap>
                <p style={{ fontSize: 11, color: A.faint, margin: '0 0 12px' }}>
                    Bu kullanıcılara <strong>mention atan</strong> kişiler gece korumasında timeout'a alınır.
                </p>
                <MultiIdInput
                    value={protectedUserIds}
                    onChange={markDirty(setProtectedUserIds)}
                    placeholder="Discord kullanıcı ID gir ve Enter'a bas..."
                    idKind="kullanıcı"
                />
            </div>

            {/* ── Korunan roller ── */}
            <div style={{ ...card, padding: 16 }}>
                <Cap style={{ display: 'block', marginBottom: 4 }}>Korunan Roller</Cap>
                <p style={{ fontSize: 11, color: A.faint, margin: '0 0 12px' }}>
                    Bu rollere <strong>mention atan</strong> kişiler de timeout'a alınır (örn. @admin, @yetkili).
                </p>
                <MultiIdInput
                    value={protectedRoleIds}
                    onChange={markDirty(setProtectedRoleIds)}
                    placeholder="Discord rol ID gir ve Enter'a bas..."
                    idKind="rol"
                />
            </div>

            {/* ── Timeout süreleri ── */}
            <div style={{ ...card, padding: 16 }}>
                <Cap style={{ display: 'block', marginBottom: 12 }}>Timeout Kademesi (Dakika)</Cap>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                    {[
                        { key: 'first',  label: '1. ihlal'  },
                        { key: 'second', label: '2. ihlal'  },
                        { key: 'third',  label: '3. ihlal'  },
                        { key: 'repeat', label: '4.+ ihlal' },
                    ].map(({ key, label }) => (
                        <div key={key}>
                            <div style={{ fontSize: 11, color: A.faint, marginBottom: 4 }}>{label}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" min="1" max="1440" value={timeouts[key]}
                                    onChange={markDirty(e => setTimeouts({ ...timeouts, [key]: e.target.value }))}
                                    style={{ ...inputStyle, width: 70, fontSize: 14, padding: '6px 8px' }}/>
                                <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>dk</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <I.Alert size={12} style={{ color: A.warn, flexShrink: 0, marginTop: 2 }}/>
                    <div style={{ fontSize: 11, color: A.dim, lineHeight: 1.6 }}>
                        İhlal sayacı her gün otomatik sıfırlanır. Ayarlar bot yeniden başlatılana kadar geçerli olmaz.
                    </div>
                </div>
            </div>

            {/* ── Kaydet ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
                position: 'sticky', bottom: 0, padding: 12,
                background: A.bg, borderTop: `1px solid ${A.border}`,
            }}>
                {dirty && (
                    <span style={{ fontSize: 11, color: A.warn, marginRight: 'auto' }}>
                        ● Kaydedilmemiş değişiklikler var
                    </span>
                )}
                <button onClick={handleSave} disabled={botSettingsMutation.isPending || !dirty}
                    style={{ ...btnPrimary, padding: '10px 18px', opacity: !dirty ? 0.5 : 1 }}>
                    <I.Check size={12} style={{ marginRight: 6, verticalAlign: -1 }}/>
                    {botSettingsMutation.isPending ? 'KAYDEDİLİYOR...' : 'AYARLARI KAYDET'}
                </button>
            </div>
        </div>
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
        
// ── Test İşlemleri Sekmesi ───────────────────────────────────────────────────

function TestActionsTab() {
    const triggerTest = useMutation({
        mutationFn: async (testCommand) => {
            const res = await api.post('/discord/trigger-test', { test_command: testCommand });
            return res.data;
        },
        onSuccess: (data) => toast.success(data.message),
        onError: (err) => toast.error(err.response?.data?.error || 'Test tetiklenemedi')
    });

    const buttons = [
        { id: 'nightlyCleanup', label: 'Whitelist Gece Temizliği Testi', desc: 'Gece saat 00:00 da yapılan whitelist rol kontrolünü anında tetikler.' },
        { id: 'timedRolesCheck', label: 'Süreli Roller Testi', desc: 'Süresi dolan rolleri anında kontrol eder ve geri alır.' },
        { id: 'dashboardUpdate', label: 'Dashboard Güncellemesi Testi', desc: 'Dashboard kanalındaki online oyuncu tablosunu anında günceller.' },
        { id: 'serverHealthMonitor', label: 'Sunucu Sağlık Testi', desc: 'Botun sunucunun durumuna bakıp bio\'sunu güncellemesini tetikler.' },
        { id: 'presenceUpdate', label: 'Bot Durumu (Presence) Testi', desc: 'Discord botunun Oynuyor (Presence) durumunu günceller.' },
        { id: 'nightGuardTest', label: 'Gece Koruması Log Testi', desc: 'Log kanalına test amaçlı bir Gece Koruması raporu gönderir.' },
    ];

    return (
        <div style={{ ...card, padding: 24 }}>
            <Cap style={{ display: 'block', marginBottom: 20 }}>Bot Test İşlemleri</Cap>
            <div style={{ fontSize: 13, color: A.faint, marginBottom: 24, lineHeight: 1.5 }}>
                Aşağıdaki butonları kullanarak botun normalde kendi kendine otomatik yaptığı işlemleri anında tetikleyebilirsiniz. Butona bastığınızda komut direkt olarak bota iletilir.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {buttons.map(b => (
                    <div key={b.id} style={{ 
                        border: `1px solid ${A.border}`, 
                        borderRadius: 8, 
                        padding: 16, 
                        background: 'rgba(0,0,0,0.02)',
                        display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{b.label}</div>
                        <div style={{ fontSize: 11, color: A.faint, flex: 1 }}>{b.desc}</div>
                        <button 
                            onClick={() => triggerTest.mutate(b.id)}
                            disabled={triggerTest.isPending}
                            style={{ 
                                ...btnGhost, 
                                alignSelf: 'flex-start',
                                fontSize: 11,
                                padding: '6px 12px',
                                border: `1px solid rgba(167, 139, 250, 0.3)`
                            }}
                        >
                            <I.Play size={12} style={{ marginRight: 6 }}/>
                            Testi Başlat
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
