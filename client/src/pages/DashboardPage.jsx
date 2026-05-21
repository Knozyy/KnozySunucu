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

function ServerCard({ server, onStatusChange }) {
    const { user } = useAuth();
    const qc = useQueryClient();

    const isRunning  = server.status === 'running';
    const isStarting = server.status === 'starting';
    const isStopping = server.status === 'stopping';
    const isStopped  = !isRunning && !isStarting && !isStopping;
    const isBusy     = isStarting || isStopping;

    const serverCpu  = server.processStats?.cpuPercent || 0;
    const serverRamMB = server.processStats?.memoryMB || 0;

    const startMutation = useMutation({
        mutationFn: () => server.is_active
            ? api.post('/minecraft/start')
            : api.post(`/servers/${server.id}/start`),
        onSuccess: () => { toast.success(`${server.name} başlatılıyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Başlatılamadı'),
    });

    const stopMutation = useMutation({
        mutationFn: () => server.is_active
            ? api.post('/minecraft/stop')
            : api.post(`/servers/${server.id}/stop`),
        onSuccess: () => { toast.success(`${server.name} durduruluyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Durdurulamadı'),
    });

    const restartMutation = useMutation({
        mutationFn: () => server.is_active
            ? api.post('/minecraft/restart')
            : api.post(`/servers/${server.id}/restart`),
        onSuccess: () => { toast.success(`${server.name} yeniden başlatılıyor...`); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Yeniden başlatılamadı'),
    });

    return (
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border p-5 space-y-4 transition-all ${
            isRunning
                ? 'border-emerald-200 dark:border-emerald-800 ring-2 ring-emerald-100 dark:ring-emerald-900/30'
                : 'border-gray-100 dark:border-gray-800'
        }`}>
            {/* Başlık */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isRunning ? 'bg-emerald-100 dark:bg-emerald-900/40' :
                        isStarting ? 'bg-amber-100 dark:bg-amber-900/40' :
                        'bg-gray-100 dark:bg-gray-800'
                    }`}>
                        <HiOutlineServer className={`w-5 h-5 ${
                            isRunning ? 'text-emerald-600' :
                            isStarting ? 'text-amber-500 animate-pulse' :
                            'text-gray-400'
                        }`} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{server.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
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
                            {server.port && <span className="text-xs text-gray-400">:{server.port}</span>}
                            {isRunning && server.pid && <span className="text-xs text-gray-400">PID: {server.pid}</span>}
                        </div>
                    </div>
                </div>
                {/* Oyuncu sayısı */}
                {isRunning && (
                    <div className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-xl flex-shrink-0">
                        <HiOutlineUsers className="w-4 h-4" />
                        {server.playerCount || 0}
                    </div>
                )}
            </div>

            {/* Kaynak kullanımı */}
            {isRunning && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex items-center gap-2">
                        <HiOutlineCpuChip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-gray-400">CPU</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{serverCpu.toFixed(1)}%</p>
                        </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex items-center gap-2">
                        <HiOutlineCircleStack className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-gray-400">RAM</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{(serverRamMB / 1024).toFixed(1)} GB</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Online oyuncular */}
            {isRunning && server.players?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {server.players.map(p => (
                        <div key={p} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
                            <img src={`https://mc-heads.net/avatar/${p}/20`} alt={p} className="w-5 h-5 rounded" loading="lazy" />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Kontrol butonları */}
            {user?.role === 'admin' && (
                <div className="flex gap-2 pt-1">
                    {isStopped ? (
                        <button onClick={() => startMutation.mutate()} disabled={isBusy || startMutation.isPending}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                            <HiOutlinePlay className="w-4 h-4" />
                            {startMutation.isPending ? 'Başlatılıyor...' : 'Başlat'}
                        </button>
                    ) : (
                        <>
                            <button onClick={() => stopMutation.mutate()} disabled={!isRunning || isBusy || stopMutation.isPending}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                                <HiOutlineStop className="w-4 h-4" />
                                {stopMutation.isPending ? 'Durduruluyor...' : 'Durdur'}
                            </button>
                            <button onClick={() => restartMutation.mutate()} disabled={isBusy || restartMutation.isPending}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                                <HiOutlineArrowPath className="w-4 h-4" />
                                Yeniden
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    const qc = useQueryClient();
    const { user, token } = useAuth();
    const { t } = useI18n();
    const [crashAlert, setCrashAlert] = useState(null);

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
            qc.invalidateQueries({ queryKey: ['modpackInstalled', 'activeProfile', 'servers-status'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Profil değişimi başarısız'),
    });

    const repairMutation = useMutation({
        mutationFn: () => api.post('/minecraft/repair'),
        onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['servers-status'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Onarım başarısız'),
    });

    const servers = serversData?.servers || [];
    const onStatusChange = () => qc.invalidateQueries({ queryKey: ['servers-status'] });

    return (
        <div className="space-y-6">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">{t('dashboard.title')}</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{t('dashboard.subtitle')}</p>
                </div>
                <a href="/servers"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                    <HiOutlinePlus className="w-4 h-4" /> Sunucu Ekle
                </a>
            </div>

            {/* Çöküm Uyarısı */}
            {crashAlert && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
                    <HiOutlineExclamationTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                            {crashAlert.autoRestarted ? '⚡ Sunucu çöktü ve otomatik yeniden başlatıldı' : '🔴 Sunucu çöktü — manuel başlatma gerekiyor'}
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
                    <a href="/modpacks" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0">
                        <HiOutlineArrowDownTray className="w-3.5 h-3.5" /> Güncelle
                    </a>
                </div>
            )}

            {/* Profil seçici (aktif sunucu için) */}
            {installedData?.modpacks?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3">
                    <HiOutlinePuzzlePiece className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">Aktif Profil</span>
                    <select
                        className="flex-1 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={activeProfileData?.profile?.id || ''}
                        onChange={(e) => {
                            if (!e.target.value) return;
                            const isAnyRunning = servers.some(s => s.status === 'running');
                            if (isAnyRunning && !window.confirm('Çalışan sunucu kapatılıp yeni profil ile başlatılacak. Emin misiniz?')) return;
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

            {/* Sunucu kartları */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[1, 2].map(i => <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
                </div>
            ) : servers.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
                    <HiOutlineServer className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500 mb-3">Henüz sunucu yok</p>
                    <a href="/servers" className="text-sm text-indigo-600 hover:underline">Sunucu eklemek için tıkla →</a>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {servers.map(server => (
                        <ServerCard key={server.id} server={server} onStatusChange={onStatusChange} />
                    ))}
                </div>
            )}
        </div>
    );
}
