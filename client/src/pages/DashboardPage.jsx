import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineServer, HiOutlineUsers, HiOutlinePlay, HiOutlineStop,
    HiOutlineArrowPath, HiOutlineWrenchScrewdriver, HiOutlinePuzzlePiece,
    HiOutlineExclamationTriangle, HiOutlineXMark, HiOutlineArrowDownTray,
    HiOutlineCpuChip, HiOutlineCircleStack, HiOutlinePlus,
} from 'react-icons/hi2';
import { useState, useEffect } from 'react';

// RAM string'ini GB'a çevir: "4G" → 4, "512M" → 0.5
function parseRamGB(str) {
    if (!str) return 0;
    const m = str.match(/^(\d+)([GgMm])$/);
    if (!m) return 0;
    return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : parseInt(m[1]) / 1024;
}

// ── Sunucu detay paneli ─────────────────────────────────────────────────────
function ServerPanel({ server, user, onStatusChange }) {
    const isRunning  = server.status === 'running';
    const isStarting = server.status === 'starting';
    const isStopping = server.status === 'stopping';
    const isStopped  = !isRunning && !isStarting && !isStopping;
    const isBusy     = isStarting || isStopping;

    const serverCpu   = server.processStats?.cpuPercent || 0;
    const serverRamMB = server.processStats?.memoryMB   || 0;
    const maxRamGB    = parseRamGB(server.max_ram);
    const usedRamGB   = serverRamMB / 1024;
    const ramPct      = maxRamGB > 0 ? Math.min(100, (usedRamGB / maxRamGB) * 100) : 0;

    const startMutation = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/start`),
        onSuccess: () => { toast.success(`${server.name} başlatılıyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Başlatılamadı'),
    });
    const stopMutation = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/stop`),
        onSuccess: () => { toast.success(`${server.name} durduruluyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Durdurulamadı'),
    });
    const restartMutation = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/restart`),
        onSuccess: () => { toast.success(`${server.name} yeniden başlatılıyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Yeniden başlatılamadı'),
    });

    return (
        <div className="p-6 space-y-5">
            {/* Başlık + Kontroller */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                {/* Sunucu adı + durum */}
                <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isRunning  ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                        isStarting ? 'bg-amber-100  dark:bg-amber-900/30'   :
                                     'bg-gray-100   dark:bg-gray-800'
                    }`}>
                        <HiOutlineServer className={`w-5 h-5 ${
                            isRunning  ? 'text-emerald-600' :
                            isStarting ? 'text-amber-500 animate-pulse' :
                                         'text-gray-400'
                        }`} />
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900 dark:text-white text-base">{server.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                                isRunning  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                isStarting ? 'bg-amber-100 text-amber-700 animate-pulse' :
                                isStopping ? 'bg-red-100 text-red-700 animate-pulse' :
                                             'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                    isRunning ? 'bg-emerald-500' : isStarting ? 'bg-amber-500' :
                                    isStopping ? 'bg-red-500' : 'bg-gray-400'
                                }`} />
                                {isRunning ? 'Çalışıyor' : isStarting ? 'Başlatılıyor...' : isStopping ? 'Durduruluyor...' : 'Kapalı'}
                            </span>
                            <span className="text-xs text-gray-400">:{server.port}</span>
                            {isRunning && server.pid && (
                                <span className="text-xs text-gray-400 font-mono">PID {server.pid}</span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-1 truncate max-w-xs" title={server.path}>
                            {server.path}
                        </p>
                    </div>
                </div>

                {/* Kontrol butonları */}
                {user?.role === 'admin' && (
                    <div className="flex gap-2 flex-shrink-0">
                        {isStopped ? (
                            <button
                                onClick={() => startMutation.mutate()}
                                disabled={startMutation.isPending}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                <HiOutlinePlay className="w-4 h-4" />
                                {startMutation.isPending ? 'Başlatılıyor...' : 'Başlat'}
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => stopMutation.mutate()}
                                    disabled={!isRunning || isBusy || stopMutation.isPending}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                                    <HiOutlineStop className="w-4 h-4" />
                                    {stopMutation.isPending ? 'Durduruluyor...' : 'Durdur'}
                                </button>
                                <button
                                    onClick={() => restartMutation.mutate()}
                                    disabled={isBusy || restartMutation.isPending}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                                    <HiOutlineArrowPath className="w-4 h-4" />
                                    Yeniden Başlat
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* İstatistik kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Oyuncu */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <HiOutlineUsers className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-gray-400 font-medium">Oyuncular</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
                        {server.playerCount || 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">aktif</p>
                </div>

                {/* CPU */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <HiOutlineCpuChip className="w-4 h-4 text-blue-500" />
                        <span className="text-xs text-gray-400 font-medium">CPU</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
                        {isRunning ? `${serverCpu.toFixed(1)}%` : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">kullanım</p>
                </div>

                {/* RAM — 2 kolon kaplıyor */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 col-span-2">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <HiOutlineCircleStack className="w-4 h-4 text-purple-500" />
                            <span className="text-xs text-gray-400 font-medium">RAM</span>
                        </div>
                        <span className="text-xs text-gray-400">
                            {isRunning
                                ? `${usedRamGB.toFixed(1)} / ${maxRamGB}G`
                                : `Maks: ${server.max_ram}`}
                        </span>
                    </div>
                    {isRunning ? (
                        <>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-2.5">
                                {usedRamGB.toFixed(1)}
                                <span className="text-sm font-normal text-gray-400 ml-1">GB</span>
                            </p>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                        ramPct > 85 ? 'bg-red-500' :
                                        ramPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${ramPct}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{ramPct.toFixed(0)}% kullanımda</p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-bold text-gray-400 leading-none">—</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Min: {server.min_ram} &nbsp;·&nbsp; Screen: knozy-mc{server.id}
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Online oyuncu listesi */}
            {isRunning && server.players?.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Online Oyuncular</p>
                    <div className="flex flex-wrap gap-2">
                        {server.players.map(p => (
                            <div key={p} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-1.5">
                                <img
                                    src={`https://mc-heads.net/avatar/${p}/20`}
                                    alt={p}
                                    className="w-5 h-5 rounded"
                                    loading="lazy"
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{p}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Ana Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const qc = useQueryClient();
    const { user, token } = useAuth();
    const { t } = useI18n();
    const [crashAlert,       setCrashAlert]       = useState(null);
    const [selectedId,       setSelectedId]       = useState(null);
    const [selectedProfileId, setSelectedProfileId] = useState(null); // Anlık dropdown değeri

    // WebSocket — crash eventi dinle
    useEffect(() => {
        if (!token) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/console?token=${token}`);
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'crash') {
                    setCrashAlert(msg.data);
                    qc.invalidateQueries({ queryKey: ['servers-status'] });
                }
            } catch { /* ignore */ }
        };
        return () => ws.close();
    }, [token, qc]);

    const { data: serversData, isLoading } = useQuery({
        queryKey: ['servers-status'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });

    const { data: installedData } = useQuery({
        queryKey: ['modpackInstalled'],
        queryFn: () => api.get('/modpacks/installed').then(r => r.data),
    });

    const { data: activeProfileData } = useQuery({
        queryKey: ['activeProfile'],
        queryFn: () => api.get('/modpacks/active').then(r => r.data),
    });

    const { data: updateInfo } = useQuery({
        queryKey: ['modpackUpdate'],
        queryFn: () => api.post('/modpacks/check-update', {}).then(r => r.data),
        refetchInterval: 300000,
        retry: false,
    });

    const activateMutation = useMutation({
        mutationFn: (id) => api.post(`/modpacks/activate/${id}`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            // Her query ayrı ayrı invalidate edilmeli — dizi geçmek çalışmıyor
            qc.invalidateQueries({ queryKey: ['modpackInstalled'] });
            qc.invalidateQueries({ queryKey: ['activeProfile'] });
            qc.invalidateQueries({ queryKey: ['servers-status'] });
        },
        onError: (e) => {
            toast.error(e.response?.data?.error || 'Profil değişimi başarısız');
            setSelectedProfileId(null); // Hata durumunda local state'i sıfırla
        },
    });

    const repairMutation = useMutation({
        mutationFn: () => api.post('/minecraft/repair'),
        onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['servers-status'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Onarım başarısız'),
    });

    const servers = serversData?.servers || [];

    // İlk yüklemede ilk sunucuyu seç
    useEffect(() => {
        if (servers.length > 0 && !selectedId) {
            setSelectedId(servers[0].id);
        }
    }, [servers, selectedId]);

    const selected = servers.find(s => s.id === selectedId) || servers[0] || null;
    const onStatusChange = () => qc.invalidateQueries({ queryKey: ['servers-status'] });

    return (
        <div className="space-y-5">
            {/* Başlık */}
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        {t('dashboard.title')}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{t('dashboard.subtitle')}</p>
                </div>
                <a href="/servers"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                    <HiOutlinePlus className="w-4 h-4" /> Sunucu Yönet
                </a>
            </div>

            {/* Çöküm Uyarısı */}
            {crashAlert && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
                    <HiOutlineExclamationTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                            {crashAlert.autoRestarted
                                ? '⚡ Sunucu çöktü ve otomatik yeniden başlatıldı'
                                : '🔴 Sunucu çöktü — manuel başlatma gerekiyor'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(crashAlert.timestamp).toLocaleString('tr-TR')} · Exit code: {crashAlert.code} · Çöküm #{crashAlert.crashCount}
                        </p>
                    </div>
                    <button onClick={() => setCrashAlert(null)} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Modpack güncelleme uyarısı */}
            {updateInfo?.hasUpdate && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">Yeni Modpack Güncellemesi!</p>
                            <p className="text-xs text-gray-500">{updateInfo.currentVersion} → {updateInfo.latestVersion}</p>
                        </div>
                    </div>
                    <a href="/modpacks"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0">
                        <HiOutlineArrowDownTray className="w-3.5 h-3.5" /> Güncelle
                    </a>
                </div>
            )}

            {/* Sunucu paneli — tab seçici + detay */}
            {isLoading ? (
                <div className="h-72 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ) : servers.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-16 text-center">
                    <HiOutlineServer className="w-14 h-14 mx-auto mb-4 text-gray-200 dark:text-gray-700" />
                    <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">Henüz sunucu yok</p>
                    <p className="text-sm text-gray-400 mb-5">Sunucu ekleyerek başlayın</p>
                    <a href="/servers"
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
                        <HiOutlinePlus className="w-4 h-4" /> Sunucu Ekle
                    </a>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    {/* Tab bar — sunucu seçici */}
                    <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
                        {servers.map((server, idx) => {
                            const isRunning  = server.status === 'running';
                            const isStarting = server.status === 'starting';
                            const isSelected = selected?.id === server.id;
                            return (
                                <button
                                    key={server.id}
                                    onClick={() => setSelectedId(server.id)}
                                    className={`flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                                        isSelected
                                            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                                        isRunning  ? 'bg-emerald-500' :
                                        isStarting ? 'bg-amber-400 animate-pulse' :
                                                     'bg-gray-300 dark:bg-gray-600'
                                    }`} />
                                    <span>Sunucu {idx + 1}</span>
                                    <span className="hidden sm:inline text-xs font-normal text-gray-400">
                                        — {server.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Seçili sunucu detayı */}
                    {selected && (
                        <ServerPanel
                            server={selected}
                            user={user}
                            onStatusChange={onStatusChange}
                        />
                    )}
                </div>
            )}

            {/* Modpack / Profil seçici */}
            {installedData?.modpacks?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3 flex-wrap">
                    <HiOutlinePuzzlePiece className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                        Aktif Profil
                    </span>
                    <select
                        className="flex-1 min-w-0 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={selectedProfileId ?? activeProfileData?.profile?.id ?? ''}
                        onChange={(e) => {
                            if (!e.target.value) return;
                            const isAnyRunning = servers.some(s => s.status === 'running');
                            if (isAnyRunning && !window.confirm('Çalışan sunucular durdurulup yeni profil aktif edilecek. Emin misiniz?')) return;
                            setSelectedProfileId(e.target.value); // Hemen dropdown'ı güncelle
                            activateMutation.mutate(e.target.value);
                        }}
                        disabled={user?.role !== 'admin' || activateMutation.isPending}
                    >
                        <option value="" disabled>Profil Seçin</option>
                        {installedData.modpacks.map(mp => (
                            <option key={mp.id} value={mp.id}>{mp.name} {mp.version}</option>
                        ))}
                    </select>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => { if (confirm('Onarım yapılsın mı?')) repairMutation.mutate(); }}
                            disabled={servers.some(s => s.status === 'running') || repairMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 disabled:opacity-50 transition-colors flex-shrink-0">
                            <HiOutlineWrenchScrewdriver className="w-3.5 h-3.5" /> Onar
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
