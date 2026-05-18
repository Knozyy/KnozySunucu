import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineChatBubbleLeftRight, HiOutlinePlay, HiOutlineStop,
    HiOutlineCog6Tooth, HiOutlineTrash, HiOutlinePlus, HiOutlineArrowPath,
    HiOutlineUserGroup, HiOutlineClock, HiOutlineCheckCircle,
    HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineCheck,
    HiOutlineMagnifyingGlass, HiOutlineClipboard, HiOutlineQueueList,
    HiOutlineSpeakerWave, HiOutlineShieldExclamation, HiOutlineInformationCircle,
    HiOutlineBell, HiOutlineLink, HiOutlineXMark,
} from 'react-icons/hi2';
import { SiDiscord } from 'react-icons/si';

// ── Küçük yardımcılar ─────────────────────────────────────────────────────────

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
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Oyuncu grafiği (SVG — smooth bezier, eksanlar, istatistikler) ─────────────
function PlayerGraph({ history }) {
    const chart = useMemo(() => {
        const cutoff = Date.now() / 1000 - 86400;
        const raw = history.filter(h => h.timestamp > cutoff);
        if (raw.length < 2) return null;

        // Çok fazla veri noktası varsa örnekle (max 150)
        const MAX_PTS = 150;
        const step = Math.max(1, Math.ceil(raw.length / MAX_PTS));
        const sampled = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);

        // SVG boyutları
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

        // Y ekseni tick'leri (0 dahil 5 adet)
        const Y_TICKS = 4;
        const yLines = Array.from({ length: Y_TICKS + 1 }, (_, i) => ({
            y: PADT + (i / Y_TICKS) * CH,
            label: Math.round(maxCount * (1 - i / Y_TICKS)),
        }));

        // X ekseni tick'leri (max 6 saat etiketi)
        const X_TICKS = Math.min(6, sampled.length);
        const xTicks = Array.from({ length: X_TICKS }, (_, i) => {
            const idx = Math.round(i * (sampled.length - 1) / Math.max(X_TICKS - 1, 1));
            const d = new Date(sampled[idx].timestamp * 1000);
            return {
                x: pts[idx].x,
                label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
            };
        });

        // Smooth bezier path
        let linePath = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const cp = (pts[i - 1].x + pts[i].x) / 2;
            linePath += ` C ${cp} ${pts[i - 1].y}, ${cp} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
        }
        const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${PADT + CH} L ${pts[0].x} ${PADT + CH} Z`;

        const avgCount = Math.round(sampled.reduce((s, h) => s + h.count, 0) / sampled.length);

        return { W, H, PADL, PADR, PADT, PADB, CW, CH, pts, yLines, xTicks, linePath, areaPath, maxCount, avgCount };
    }, [history]);

    if (!chart) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <HiOutlineChatBubbleLeftRight className="w-6 h-6 opacity-30" />
                </div>
                <p className="text-sm font-medium">Yeterli veri yok</p>
                <p className="text-xs text-gray-300">Bot çalışırken her 30 saniyede bir kayıt oluşturulur</p>
            </div>
        );
    }

    const { W, H, PADL, PADT, CW, CH, pts, yLines, xTicks, linePath, areaPath, maxCount, avgCount } = chart;
    const currentCount = pts[pts.length - 1].count;

    return (
        <div className="space-y-4">
            {/* İstatistik şeridi */}
            <div className="flex items-center gap-8">
                <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{currentCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Şu an online</p>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div className="text-center">
                    <p className="text-3xl font-bold text-indigo-600 tabular-nums">{maxCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Son 24sa maks.</p>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div className="text-center">
                    <p className="text-3xl font-bold text-gray-500 tabular-nums">{avgCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Ortalama</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                    <span className="text-xs text-gray-400">{pts.length} veri noktası · son 24 saat</span>
                </div>
            </div>

            {/* Grafik */}
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '200px' }}>
                <defs>
                    <linearGradient id="pg-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
                    </linearGradient>
                    <clipPath id="pg-clip">
                        <rect x={PADL} y={PADT} width={CW} height={CH + 1} />
                    </clipPath>
                </defs>

                {/* Yatay grid çizgileri + Y etiketleri */}
                {yLines.map((t, i) => (
                    <g key={i}>
                        <line
                            x1={PADL} y1={t.y} x2={W - 20} y2={t.y}
                            stroke={i === yLines.length - 1 ? '#d1d5db' : '#f3f4f6'}
                            strokeWidth="1"
                        />
                        <text x={PADL - 10} y={t.y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
                            {t.label}
                        </text>
                    </g>
                ))}

                {/* Alan dolgusu + çizgi (clip ile sınırlandırılmış) */}
                <g clipPath="url(#pg-clip)">
                    <path d={areaPath} fill="url(#pg-grad)" />
                    <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>

                {/* Son nokta vurgusu */}
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="5" fill="#6366f1" stroke="white" strokeWidth="2.5" />

                {/* X ekseni çizgisi */}
                <line x1={PADL} y1={PADT + CH} x2={W - 20} y2={PADT + CH} stroke="#e5e7eb" strokeWidth="1" />

                {/* X zaman etiketleri */}
                {xTicks.map((t, i) => (
                    <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize="11" fill="#9ca3af">
                        {t.label}
                    </text>
                ))}

                {/* Y ekseni çizgisi */}
                <line x1={PADL} y1={PADT} x2={PADL} y2={PADT + CH} stroke="#e5e7eb" strokeWidth="1" />
            </svg>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DiscordPage() {
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState('whitelist');
    const [wlSearch, setWlSearch] = useState('');
    const [newUserId, setNewUserId] = useState('');
    const [newMcNick, setNewMcNick] = useState('');
    const [botDirInput, setBotDirInput] = useState('');
    const [showConfig, setShowConfig] = useState(false);

    // ── Queries ───────────────────────────────────────────────────────────────

    const { data: status, isLoading: statusLoading } = useQuery({
        queryKey: ['discord-status'],
        queryFn: () => api.get('/discord/status').then(r => r.data),
        refetchInterval: 10000,
        onSuccess: (d) => { if (!botDirInput && d.botDir) setBotDirInput(d.botDir); },
    });

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
        return entries.filter(e => e.mcNick.toLowerCase().includes(q) || e.userId.includes(q));
    }, [wlData, wlSearch]);

    // ── Active timed roles ────────────────────────────────────────────────────

    const now = Math.floor(Date.now() / 1000);
    const timedRoles = rolesData?.roles || [];
    const activeRoles = timedRoles.filter(r => r.expiry_timestamp > now);
    const expiredRoles = timedRoles.filter(r => r.expiry_timestamp <= now);

    // ── Render ────────────────────────────────────────────────────────────────

    const isRunning = status?.running;

    return (
        <div className="space-y-6">

            {/* ── Başlık ── */}
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                        <SiDiscord className="w-7 h-7 text-indigo-500" />
                        Discord Bot
                    </h1>
                    <p className="text-sm text-gray-500">KnozyBot — Discord ↔ Minecraft entegrasyonu</p>
                </div>
                <button
                    onClick={() => { queryClient.invalidateQueries({ queryKey: ['discord-status'] }); queryClient.invalidateQueries({ queryKey: ['discord-whitelist'] }); }}
                    className="btn-secondary text-xs"
                >
                    <HiOutlineArrowPath className="w-4 h-4" />
                </button>
            </div>

            {/* ── Bot Durum Kartı ── */}
            <div className="glass-card p-5 fade-in">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        {statusLoading ? (
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                        ) : isRunning ? (
                            <HiOutlineCheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                        ) : (
                            <HiOutlineXCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
                        )}
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                                {isRunning ? 'Bot Çalışıyor' : 'Bot Kapalı'}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                                screen: {status?.screenName || 'knozy-discord'}
                                {status?.botDir ? ` · ${status.botDir}` : ' · dizin ayarlanmamış'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowConfig(v => !v)}
                            className="btn-secondary text-xs"
                            title="Bot dizinini ayarla"
                        >
                            <HiOutlineCog6Tooth className="w-4 h-4" />
                        </button>
                        {isRunning ? (
                            <button
                                onClick={() => stopMutation.mutate()}
                                disabled={stopMutation.isPending}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium transition-colors"
                            >
                                <HiOutlineStop className="w-4 h-4" />
                                {stopMutation.isPending ? 'Durduruluyor...' : 'Durdur'}
                            </button>
                        ) : (
                            <button
                                onClick={() => startMutation.mutate()}
                                disabled={startMutation.isPending || !status?.botDir}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium transition-colors disabled:opacity-40"
                            >
                                <HiOutlinePlay className="w-4 h-4" />
                                {startMutation.isPending ? 'Başlatılıyor...' : 'Başlat'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Dizin ayar formu */}
                {showConfig && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                            Bot Dizini (sunucudaki mutlak yol)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={botDirInput}
                                onChange={e => setBotDirInput(e.target.value)}
                                placeholder="/home/user/KnozyBot"
                                className="input-field flex-1 font-mono text-sm"
                            />
                            <button
                                onClick={() => configMutation.mutate(botDirInput)}
                                disabled={configMutation.isPending || !botDirInput.trim()}
                                className="btn-primary text-xs flex items-center gap-1.5"
                            >
                                <HiOutlineCheck className="w-3.5 h-3.5" />
                                {configMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                        {status && !status.dirExists && status.botDir && (
                            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                                <HiOutlineExclamationTriangle className="w-3.5 h-3.5" />
                                Dizin sunucuda bulunamadı. Yolu kontrol edin.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Sekmeler ── */}
            <div className="flex gap-2 fade-in flex-wrap">
                {[
                    { key: 'whitelist', label: 'Whitelist', icon: HiOutlineUserGroup },
                    { key: 'timed-roles', label: 'Süreli Roller', icon: HiOutlineClock },
                    { key: 'rcon-queue', label: 'RCON Kuyruğu', icon: HiOutlineQueueList },
                    { key: 'status-messages', label: 'Durum Mesajları', icon: HiOutlineSpeakerWave },
                    { key: 'night-guard', label: 'Gece Koruması', icon: HiOutlineShieldExclamation },
                    { key: 'graph', label: 'Oyuncu Grafiği', icon: HiOutlineChatBubbleLeftRight },
                    { key: 'webhook', label: 'Webhook', icon: HiOutlineBell },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ══ Whitelist Sekmesi ══════════════════════════════════════════════════ */}
            {activeTab === 'whitelist' && (
                <>
                    {/* Ekle formu */}
                    <div className="glass-card p-4 fade-in">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                            <HiOutlinePlus className="w-4 h-4" /> Yeni Kayıt Ekle
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            <input
                                type="text"
                                value={newUserId}
                                onChange={e => setNewUserId(e.target.value)}
                                placeholder="Discord Kullanıcı ID (örn: 123456789012345678)"
                                className="input-field flex-1 min-w-48 font-mono text-sm"
                            />
                            <input
                                type="text"
                                value={newMcNick}
                                onChange={e => setNewMcNick(e.target.value)}
                                placeholder="Minecraft Nick"
                                className="input-field w-48 font-mono text-sm"
                                onKeyDown={e => { if (e.key === 'Enter' && newUserId && newMcNick) addWlMutation.mutate({ userId: newUserId, mcNick: newMcNick }); }}
                            />
                            <button
                                onClick={() => addWlMutation.mutate({ userId: newUserId, mcNick: newMcNick })}
                                disabled={addWlMutation.isPending || !newUserId.trim() || !newMcNick.trim()}
                                className="btn-primary text-xs flex items-center gap-1.5"
                            >
                                <HiOutlinePlus className="w-3.5 h-3.5" />
                                {addWlMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
                            </button>
                        </div>
                    </div>

                    {/* Arama */}
                    <div className="relative fade-in">
                        <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={wlSearch}
                            onChange={e => setWlSearch(e.target.value)}
                            placeholder="Nick veya Discord ID ile ara..."
                            className="input-field pl-11 text-sm"
                        />
                    </div>

                    {/* Liste */}
                    <div className="glass-card overflow-hidden fade-in">
                        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                {wlData?.total ?? 0} kayıtlı oyuncu
                            </span>
                        </div>
                        {wlLoading ? (
                            <div className="p-8 text-center text-gray-400">
                                <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                                Yükleniyor...
                            </div>
                        ) : filteredEntries.length === 0 ? (
                            <div className="p-10 text-center text-gray-400">
                                <HiOutlineUserGroup className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>{wlSearch ? 'Eşleşen kayıt bulunamadı.' : 'Henüz kayıtlı oyuncu yok.'}</p>
                            </div>
                        ) : (
                            filteredEntries.map((e, i) => (
                                <div key={e.userId} className={`flex items-center gap-3 px-5 py-3 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${i !== filteredEntries.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}>
                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                            {e.mcNick[0].toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{e.mcNick}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-xs text-gray-400 font-mono truncate">{e.userId}</span>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(e.userId); toast.success('Kopyalandı'); }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="ID Kopyala"
                                            >
                                                <HiOutlineClipboard className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700" />
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { if (confirm(`${e.mcNick} whitelist'ten çıkarılacak. Emin misiniz?`)) delWlMutation.mutate(e.userId); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                        title="Sil"
                                    >
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* ══ Süreli Roller Sekmesi ═════════════════════════════════════════════ */}
            {activeTab === 'timed-roles' && (
                <TimedRolesTab
                    rolesLoading={rolesLoading}
                    timedRoles={timedRoles}
                    activeRoles={activeRoles}
                    expiredRoles={expiredRoles}
                    now={now}
                    addRoleMutation={addRoleMutation}
                    delRoleMutation={delRoleMutation}
                />
            )}

            {/* ══ RCON Kuyruğu ══════════════════════════════════════════════════════ */}
            {activeTab === 'rcon-queue' && (
                <RconQueueTab
                    queueData={queueData}
                    queueLoading={queueLoading}
                    clearQueueMutation={clearQueueMutation}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['discord-rcon-queue'] })}
                />
            )}

            {/* ══ Durum Mesajları ═══════════════════════════════════════════════════ */}
            {activeTab === 'status-messages' && (
                <StatusMessagesTab
                    statusMsgData={statusMsgData}
                    statusMsgLoading={statusMsgLoading}
                    addStatusMsgMutation={addStatusMsgMutation}
                    delStatusMsgMutation={delStatusMsgMutation}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['discord-status-messages'] })}
                />
            )}

            {/* ══ Gece Koruması ═════════════════════════════════════════════════════ */}
            {activeTab === 'night-guard' && <NightGuardTab />}

            {/* ══ Oyuncu Grafiği ════════════════════════════════════════════════════ */}
            {activeTab === 'graph' && (
                <div className="glass-card p-5 fade-in">
                    <div className="flex items-center justify-between mb-5">
                        <p className="font-semibold text-gray-900 dark:text-white">Son 24 Saatlik Oyuncu Grafiği</p>
                        <button
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['discord-history'] })}
                            className="btn-secondary text-xs"
                        >
                            <HiOutlineArrowPath className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <PlayerGraph history={historyData?.history || []} />
                </div>
            )}

            {activeTab === 'webhook' && <WebhookTab />}

        </div>
    );
}

// ── Süreli Roller (CRUD) ──────────────────────────────────────────────────────
function TimedRolesTab({ rolesLoading, timedRoles, activeRoles, expiredRoles, now, addRoleMutation, delRoleMutation }) {
    const [form, setForm] = useState({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' });
    const [showForm, setShowForm] = useState(false);

    const handleAdd = () => {
        addRoleMutation.mutate(form, {
            onSuccess: () => { setForm({ user_id: '', guild_id: '', role_id: '', durationDays: '', durationHours: '' }); setShowForm(false); }
        });
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {activeRoles.length} aktif · {expiredRoles.length} süresi dolmuş
                </span>
                <button onClick={() => setShowForm(v => !v)} className="btn-secondary text-xs flex items-center gap-1.5">
                    <HiOutlinePlus className="w-3.5 h-3.5" /> Yeni Ekle
                </button>
            </div>

            {showForm && (
                <div className="glass-card p-4 space-y-3 fade-in">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Yeni Süreli Rol</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Discord Kullanıcı ID</label>
                            <input type="text" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="input-field font-mono text-sm" placeholder="123456789..." />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Sunucu (Guild) ID</label>
                            <input type="text" value={form.guild_id} onChange={e => setForm(f => ({ ...f, guild_id: e.target.value }))} className="input-field font-mono text-sm" placeholder="987654321..." />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Rol ID</label>
                            <input type="text" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))} className="input-field font-mono text-sm" placeholder="111222333..." />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Gün</label>
                                <input type="number" value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} className="input-field text-sm" placeholder="0" min="0" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Saat</label>
                                <input type="number" value={form.durationHours} onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))} className="input-field text-sm" placeholder="0" min="0" max="23" />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">İptal</button>
                        <button onClick={handleAdd} disabled={addRoleMutation.isPending || !form.user_id || !form.guild_id || !form.role_id} className="btn-primary text-sm">
                            {addRoleMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
                        </button>
                    </div>
                </div>
            )}

            <div className="glass-card overflow-hidden">
                {rolesLoading ? (
                    <div className="p-8 text-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                        Yükleniyor...
                    </div>
                ) : timedRoles.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <HiOutlineClock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Süreli rol kaydı yok.</p>
                    </div>
                ) : (
                    timedRoles.map((r, i) => {
                        const expired = r.expiry_timestamp <= now;
                        return (
                            <div key={i} className={`flex items-center gap-3 px-5 py-3 group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${i !== timedRoles.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''} ${expired ? 'opacity-50' : ''}`}>
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? 'bg-gray-300' : 'bg-green-400'}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                                        <span className="text-gray-400">Kullanıcı:</span> {r.user_id}
                                        &nbsp;·&nbsp;
                                        <span className="text-gray-400">Rol:</span> {r.role_id}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {expired ? '⏹ Süresi doldu' : `⏳ ${timeAgo(r.expiry_timestamp)} kaldı`}
                                        {' · '}{formatExpiry(r.expiry_timestamp)}
                                    </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${expired ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                    {expired ? 'Doldu' : 'Aktif'}
                                </span>
                                <button
                                    onClick={() => delRoleMutation.mutate(i)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Sil"
                                >
                                    <HiOutlineTrash className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ── RCON Kuyruğu ─────────────────────────────────────────────────────────────
function RconQueueTab({ queueData, queueLoading, clearQueueMutation, onRefresh }) {
    const queue = queueData?.queue || [];
    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <HiOutlineQueueList className="w-4 h-4 text-gray-500" /> RCON Komut Kuyruğu
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Sunucu çevrimdışıyken birikmiş, henüz çalıştırılamamış komutlar.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onRefresh} className="btn-secondary text-xs"><HiOutlineArrowPath className="w-3.5 h-3.5" /></button>
                    {queue.length > 0 && (
                        <button onClick={() => clearQueueMutation.mutate()} disabled={clearQueueMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all">
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                            {clearQueueMutation.isPending ? 'Temizleniyor...' : 'Kuyruğu Temizle'}
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                {queueLoading ? (
                    <div className="p-8 text-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                        Yükleniyor...
                    </div>
                ) : queue.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <HiOutlineCheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Kuyruk boş — tüm komutlar iletildi.</p>
                    </div>
                ) : (
                    queue.map((item, i) => (
                        <div key={i} className={`px-5 py-3.5 ${i !== queue.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}>
                            <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{item.command}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                {item.server && <span>Sunucu: {item.server}</span>}
                                {item.attempts !== undefined && <span>Deneme: {item.attempts}</span>}
                                {item.timestamp && <span>{new Date(item.timestamp).toLocaleString('tr-TR')}</span>}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Durum Mesajları ───────────────────────────────────────────────────────────
function StatusMessagesTab({ statusMsgData, statusMsgLoading, addStatusMsgMutation, delStatusMsgMutation, onRefresh }) {
    const messages = statusMsgData?.messages || {};
    const serverNames = Object.keys(messages);
    const [serverName, setServerName] = useState('');
    const [newMsg, setNewMsg] = useState('');

    const effectiveServer = serverName.trim() || (serverNames[0] || '');

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <HiOutlineSpeakerWave className="w-4 h-4 text-gray-500" /> Dönen Durum Mesajları
                    </p>
                    <button onClick={onRefresh} className="btn-secondary text-xs"><HiOutlineArrowPath className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-xs text-gray-500 mb-4">Bot her 15 saniyede bu mesajlar arasında geçiş yapar. Aktif oyuncu sayısı da dahil edilir.</p>
                <div className="flex gap-2 flex-wrap">
                    <input
                        type="text"
                        value={serverName}
                        onChange={e => setServerName(e.target.value)}
                        placeholder={serverNames[0] || 'Sunucu adı (config.py\'deki)'}
                        className="input-field w-40 text-sm font-mono"
                    />
                    <input
                        type="text"
                        value={newMsg}
                        onChange={e => setNewMsg(e.target.value)}
                        placeholder="Yeni durum mesajı..."
                        className="input-field flex-1 min-w-40 text-sm"
                        onKeyDown={e => { if (e.key === 'Enter' && effectiveServer && newMsg) addStatusMsgMutation.mutate({ serverName: effectiveServer, message: newMsg }, { onSuccess: () => setNewMsg('') }); }}
                    />
                    <button
                        onClick={() => addStatusMsgMutation.mutate({ serverName: effectiveServer, message: newMsg }, { onSuccess: () => setNewMsg('') })}
                        disabled={addStatusMsgMutation.isPending || !effectiveServer || !newMsg.trim()}
                        className="btn-primary text-xs flex items-center gap-1.5"
                    >
                        <HiOutlinePlus className="w-3.5 h-3.5" />
                        {addStatusMsgMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                {statusMsgLoading ? (
                    <div className="p-8 text-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                        Yükleniyor...
                    </div>
                ) : serverNames.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <HiOutlineSpeakerWave className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Durum mesajı yok. Yukarıdan ekleyebilirsiniz.</p>
                    </div>
                ) : (
                    serverNames.map(srv => (
                        <div key={srv}>
                            <div className="px-5 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                <span className="text-xs font-semibold text-gray-500 font-mono">{srv}</span>
                            </div>
                            {(messages[srv] || []).map((msg, idx) => (
                                <div key={idx} className={`flex items-center gap-3 px-5 py-3 group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${idx !== messages[srv].length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}>
                                    <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}.</span>
                                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{msg}</span>
                                    <button
                                        onClick={() => delStatusMsgMutation.mutate({ serverName: srv, index: idx })}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Gece Koruması (bilgi paneli) ──────────────────────────────────────────────
function NightGuardTab() {
    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-5">
                <div className="flex items-start gap-3">
                    <HiOutlineShieldExclamation className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white">Gece Koruması (Night Guard)</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Belirlenen saatler arasında admin veya korumalı rollere mention atan kullanıcıları
                            otomatik timeout'a alır. İhlal sayısına göre süre artar.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Aktif Saatler</p>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <HiOutlineClock className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">00:00 – 08:00</p>
                            <p className="text-xs text-gray-400">İstanbul Saati (UTC+3)</p>
                        </div>
                    </div>
                </div>

                <div className="glass-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Timeout Kademesi</p>
                    <div className="space-y-1.5">
                        {[
                            { n: '1. ihlal', dur: '1 dakika' },
                            { n: '2. ihlal', dur: '5 dakika' },
                            { n: '3. ihlal', dur: '15 dakika' },
                            { n: '4.+ ihlal', dur: '30 dakika' },
                        ].map(({ n, dur }) => (
                            <div key={n} className="flex justify-between text-sm">
                                <span className="text-gray-500">{n}</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">{dur}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="glass-card p-4 flex items-start gap-3">
                <HiOutlineInformationCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-500">
                    <p>İhlal sayacı her gün otomatik sıfırlanır. Koruma konfigürasyonu bot'un <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">config.py</code> dosyasından yönetilir.</p>
                </div>
            </div>
        </div>
    );
}

// ── Webhook Bildirimleri ──────────────────────────────────────────────────────
const ALL_EVENTS = [
    { key: 'server_start',  label: 'Sunucu Başladı',  emoji: '🟢' },
    { key: 'server_stop',   label: 'Sunucu Durdu',    emoji: '🔴' },
    { key: 'server_crash',  label: 'Sunucu Çöktü',    emoji: '💥' },
    { key: 'player_join',   label: 'Oyuncu Girdi',    emoji: '👋' },
    { key: 'player_leave',  label: 'Oyuncu Ayrıldı',  emoji: '🚶' },
];

function WebhookTab() {
    const qc = useQueryClient();

    const { data: cfg } = useQuery({
        queryKey: ['webhook-config'],
        queryFn: () => api.get('/discord/webhook-config').then(r => r.data),
    });

    const [url, setUrl] = useState('');
    const [events, setEvents] = useState(ALL_EVENTS.map(e => e.key));

    // Sync local state when config loads
    useState(() => {
        if (cfg) { setUrl(cfg.url || ''); setEvents(cfg.events || ALL_EVENTS.map(e => e.key)); }
    }, [cfg]);

    const saveMutation = useMutation({
        mutationFn: () => api.put('/discord/webhook-config', { url, events }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhook-config'] }); toast.success('Webhook kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const testMutation = useMutation({
        mutationFn: () => api.post('/discord/webhook-test'),
        onSuccess: () => toast.success('Test mesajı gönderildi ✓'),
        onError: (e) => toast.error(e.response?.data?.error || 'Gönderilemedi'),
    });

    const toggleEvent = (key) => {
        setEvents(prev => prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]);
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <HiOutlineBell className="w-5 h-5 text-indigo-500" />
                    <h2 className="font-semibold text-gray-900 dark:text-white">Discord Webhook Bildirimleri</h2>
                </div>
                <p className="text-sm text-gray-500">Seçtiğiniz olaylar gerçekleştiğinde bir Discord kanalına otomatik mesaj gönderir.</p>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Webhook URL</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <HiOutlineLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="url"
                                value={cfg ? (url || cfg.url || '') : ''}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="https://discord.com/api/webhooks/..."
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <button
                            onClick={() => testMutation.mutate()}
                            disabled={testMutation.isPending || !url}
                            className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                        >
                            {testMutation.isPending ? '...' : 'Test'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Discord kanalı → Entegrasyonlar → Webhook oluştur → URL kopyala</p>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Bildirim Olayları</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ALL_EVENTS.map(evt => {
                            const enabled = events.includes(evt.key);
                            return (
                                <button
                                    key={evt.key}
                                    onClick={() => toggleEvent(evt.key)}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                                        enabled
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                                    }`}
                                >
                                    <span className="text-base">{evt.emoji}</span>
                                    <span className="flex-1">{evt.label}</span>
                                    {enabled && <HiOutlineCheck className="w-4 h-4 flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-40"
                >
                    {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>
        </div>
    );
}
