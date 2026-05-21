import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineUsers, HiOutlineClock, HiOutlineCalendarDays,
    HiOutlineMagnifyingGlass, HiOutlineTrophy, HiOutlineNoSymbol,
    HiOutlineCheckCircle, HiOutlineChatBubbleLeftEllipsis,
    HiOutlinePlus, HiOutlineTrash, HiOutlineArrowPath,
} from 'react-icons/hi2';

const api = (url) => apiClient.get(url).then(r => r.data);

function fmtDuration(seconds) {
    if (!seconds) return '0sn';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}s ${m}d`;
    if (m > 0) return `${m}d ${s}sn`;
    return `${s}sn`;
}

function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} gün önce`;
    if (h > 0) return `${h} saat önce`;
    if (m > 0) return `${m} dk önce`;
    return 'az önce';
}

function PlayerHead({ username, size = 8 }) {
    return (
        <img
            src={`https://mc-heads.net/avatar/${username}/32`}
            alt={username}
            className={`w-${size} h-${size} rounded-lg flex-shrink-0`}
            onError={e => { e.target.src = 'https://mc-heads.net/avatar/steve/32'; }}
        />
    );
}

export default function PlayersPage() {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('sessions');

    const { data: online, isFetching: onlineFetching, refetch: refetchOnline } = useQuery({
        queryKey: ['players-online'],
        queryFn: () => api('/players/online'),
        refetchInterval: 5000,
    });

    const { data: sessionsRaw = [], isLoading: sessionsLoading } = useQuery({
        queryKey: ['player-sessions', search],
        queryFn: () => api(`/players/sessions?limit=500${search ? `&username=${encodeURIComponent(search)}` : ''}`),
        refetchInterval: 15000,
    });

    // Her oyuncunun sadece en son oturumunu göster (tekrar eden oyuncuları gizle)
    const sessions = (() => {
        const seen = new Map();
        for (const s of sessionsRaw) {
            if (!seen.has(s.username)) seen.set(s.username, s);
        }
        return Array.from(seen.values());
    })();

    const { data: stats = [], isLoading: statsLoading } = useQuery({
        queryKey: ['player-stats'],
        queryFn: () => api('/players/stats'),
        refetchInterval: 30000,
    });

    const onlinePlayers = online?.players ?? [];
    const mcStatus = online?.status ?? 'stopped';

    const { data: banlog = [], isLoading: banloading } = useQuery({
        queryKey: ['banlog'],
        queryFn: () => api('/players/banlog'),
        refetchInterval: 30000,
    });

    const tabs = [
        { id: 'sessions', label: 'Oturum Geçmişi', icon: HiOutlineCalendarDays },
        { id: 'stats',    label: 'İstatistikler',  icon: HiOutlineTrophy },
        { id: 'banlog',   label: 'Ban Günlüğü',    icon: HiOutlineNoSymbol },
        { id: 'notes',    label: 'Oyuncu Notları', icon: HiOutlineChatBubbleLeftEllipsis },
    ];

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Oyuncular</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Oturum geçmişi ve oyuncu istatistikleri</p>
            </div>

            {/* Online şu an */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className={`w-2 h-2 rounded-full ${mcStatus === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Şu An Online</h2>
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                        {onlinePlayers.length}
                    </span>
                    <button
                        onClick={() => refetchOnline()}
                        title="Yenile"
                        className="ml-auto p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <HiOutlineArrowPath className={`w-4 h-4 ${onlineFetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                {onlinePlayers.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                        {mcStatus === 'running' ? 'Şu an online oyuncu yok.' : 'Sunucu çalışmıyor.'}
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {onlinePlayers.map(name => (
                            <div key={name} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl px-3 py-2">
                                <PlayerHead username={name} size={6} />
                                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}>
                        <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'sessions' && (
                <div className="space-y-4">
                    <div className="relative max-w-xs">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Oyuncu adı ara..."
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Son Oturumlar</span>
                            <span className="text-xs text-gray-400">{sessions.length} kayıt</span>
                        </div>
                        {sessionsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="py-12 text-center">
                                <HiOutlineUsers className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                <p className="text-sm text-gray-400 dark:text-gray-500">Henüz oturum kaydı yok.</p>
                                <p className="text-xs text-gray-400 mt-1">Bir oyuncu sunucuya girdiğinde burada görünür.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50 dark:divide-gray-800">
                                {sessions.map(s => (
                                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <PlayerHead username={s.username} size={8} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-gray-900 dark:text-white">{s.username}</span>
                                                {!s.left_at && (
                                                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">online</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                {fmtDate(s.joined_at)}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                                                <HiOutlineClock className="w-3.5 h-3.5 text-gray-400" />
                                                {s.left_at
                                                    ? fmtDuration(s.duration_seconds)
                                                    : <span className="text-emerald-600 dark:text-emerald-400">aktif</span>
                                                }
                                            </div>
                                            {s.left_at && (
                                                <div className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(s.left_at)}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">En Fazla Oynayan (Top 20)</span>
                    </div>
                    {statsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                        </div>
                    ) : stats.length === 0 ? (
                        <div className="py-12 text-center">
                            <HiOutlineTrophy className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm text-gray-400 dark:text-gray-500">Henüz istatistik yok.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 dark:divide-gray-800">
                            {stats.map((p, idx) => {
                                const maxSeconds = stats[0]?.total_seconds || 1;
                                const pct = Math.round((p.total_seconds / maxSeconds) * 100);
                                const medals = ['🥇', '🥈', '🥉'];
                                return (
                                    <div key={p.username} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <span className="w-6 text-center text-sm flex-shrink-0">
                                            {idx < 3
                                                ? medals[idx]
                                                : <span className="text-gray-400 dark:text-gray-500 text-xs">#{idx + 1}</span>
                                            }
                                        </span>
                                        <PlayerHead username={p.username} size={8} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-sm text-gray-900 dark:text-white">{p.username}</span>
                                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmtDuration(p.total_seconds)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{p.session_count} oturum</span>
                                            </div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                Son görülme: {timeAgo(p.last_seen)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'notes' && <PlayerNotesPanel />}

            {activeTab === 'banlog' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ban Geçmişi</span>
                        <span className="text-xs text-gray-400">{banlog.length} kayıt</span>
                    </div>
                    {banloading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                        </div>
                    ) : banlog.length === 0 ? (
                        <div className="py-12 text-center">
                            <HiOutlineNoSymbol className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm text-gray-400 dark:text-gray-500">Ban geçmişi yok.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 dark:divide-gray-800">
                            {banlog.map(b => {
                                const isBan = b.action === 'ban' || b.action === 'ban-ip';
                                return (
                                    <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isBan ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                                            {isBan ? <HiOutlineNoSymbol className="w-4 h-4" /> : <HiOutlineCheckCircle className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-gray-900 dark:text-white">{b.username}</span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isBan ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                                                    {b.action}
                                                </span>
                                            </div>
                                            {b.reason && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">Neden: {b.reason}</p>}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{b.banned_by}</div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(new Date(b.created_at).getTime())}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function PlayerNotesPanel() {
    const qc = useQueryClient();
    const [username, setUsername] = useState('');
    const [searched, setSearched] = useState('');
    const [note, setNote] = useState('');

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ['player-notes', searched],
        queryFn: () => searched ? apiClient.get(`/players/notes/${encodeURIComponent(searched)}`).then(r => r.data) : Promise.resolve([]),
        enabled: !!searched,
    });

    const addMutation = useMutation({
        mutationFn: () => apiClient.post(`/players/notes/${encodeURIComponent(searched)}`, { note }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['player-notes', searched] }); setNote(''); toast.success('Not eklendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => apiClient.delete(`/players/notes/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['player-notes', searched] }); toast.success('Not silindi'); },
    });

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <div className="relative flex-1 max-w-xs">
                    <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={username} onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && setSearched(username)}
                        placeholder="Oyuncu adı..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <button onClick={() => setSearched(username)} disabled={!username.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-40">
                    Ara
                </button>
            </div>

            {searched && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                        <PlayerHead username={searched} size={8} />
                        <span className="font-semibold text-gray-900 dark:text-white">{searched}</span>
                    </div>
                    <div className="flex gap-2">
                        <input value={note} onChange={e => setNote(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && note.trim() && addMutation.mutate()}
                            placeholder="Yeni not ekle..."
                            className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={() => addMutation.mutate()} disabled={!note.trim() || addMutation.isPending}
                            className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
                            <HiOutlinePlus className="w-4 h-4" />
                        </button>
                    </div>
                    {isLoading ? (
                        <div className="text-center py-4 text-gray-400 text-sm">Yükleniyor...</div>
                    ) : notes.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">Bu oyuncu için not yok.</p>
                    ) : (
                        <div className="space-y-2">
                            {notes.map(n => (
                                <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: n.color || '#6366f1' }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-700 dark:text-gray-300">{n.note}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{n.created_by} · {new Date(n.created_at).toLocaleDateString('tr-TR')}</p>
                                    </div>
                                    <button onClick={() => deleteMutation.mutate(n.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 rounded-lg">
                                        <HiOutlineTrash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
