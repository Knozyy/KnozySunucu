import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineChatBubbleLeftRight, HiOutlinePlay, HiOutlineStop,
    HiOutlineCog6Tooth, HiOutlineTrash, HiOutlinePlus, HiOutlineArrowPath,
    HiOutlineUserGroup, HiOutlineClock, HiOutlineCheckCircle,
    HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineCheck,
    HiOutlineMagnifyingGlass, HiOutlineClipboard,
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

// ── Oyuncu grafiği (SVG tabanlı) ──────────────────────────────────────────────
function PlayerGraph({ history }) {
    const last24h = useMemo(() => {
        const cutoff = Date.now() / 1000 - 86400;
        return history.filter(h => h.timestamp > cutoff);
    }, [history]);

    if (last24h.length < 2) {
        return (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                Yeterli veri yok (min. 2 veri noktası)
            </div>
        );
    }

    const W = 600, H = 160, PAD = 16;
    const maxCount = Math.max(...last24h.map(h => h.count), 1);
    const minTs = last24h[0].timestamp;
    const maxTs = last24h[last24h.length - 1].timestamp;
    const tsRange = Math.max(maxTs - minTs, 1);

    const pts = last24h.map(h => ({
        x: PAD + ((h.timestamp - minTs) / tsRange) * (W - PAD * 2),
        y: PAD + (1 - h.count / maxCount) * (H - PAD * 2),
        count: h.count,
    }));

    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
    const area = `${pts[0].x},${H - PAD} ${polyline} ${pts[pts.length - 1].x},${H - PAD}`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
            <defs>
                <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill="url(#gfill)" />
            <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
            {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="#6366f1" />
            ))}
        </svg>
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
                    { key: 'graph', label: 'Oyuncu Grafiği', icon: HiOutlineChatBubbleLeftRight },
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
                <div className="glass-card overflow-hidden fade-in">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {activeRoles.length} aktif · {expiredRoles.length} süresi dolmuş
                        </span>
                    </div>
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
                                <div key={i} className={`flex items-center gap-3 px-5 py-3 ${i !== timedRoles.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''} ${expired ? 'opacity-50' : ''}`}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? 'bg-gray-300' : 'bg-green-400'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
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
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ══ Oyuncu Grafiği ════════════════════════════════════════════════════ */}
            {activeTab === 'graph' && (
                <div className="glass-card p-5 fade-in">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white">Son 24 Saatlik Oyuncu Grafiği</p>
                            <p className="text-xs text-gray-400 mt-0.5">Bot çalışırken her 30 saniyede güncellenir</p>
                        </div>
                    </div>
                    <PlayerGraph history={historyData?.history || []} />
                </div>
            )}

        </div>
    );
}
