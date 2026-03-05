import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { formatBytes, formatUptime } from '@/utils/formatters';
import {
    HiOutlineCpuChip, HiOutlineCircleStack, HiOutlineServer,
    HiOutlineClock, HiOutlineSignal, HiOutlineUsers,
    HiOutlineArrowDownTray, HiOutlineExclamationTriangle,
    HiOutlinePlay, HiOutlineStop, HiOutlineArrowPath,
    HiOutlineWrenchScrewdriver, HiOutlinePuzzlePiece,
} from 'react-icons/hi2';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useState, useEffect, useRef } from 'react';

function CircularProgress({ value, size = 120, strokeWidth = 10, color, label, subLabel }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(value, 100) / 100) * circumference;
    const getColor = () => {
        if (color) return color;
        if (value > 80) return '#EF4444';
        if (value > 60) return '#F59E0B';
        return '#22C55E';
    };
    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none" />
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke={getColor()} strokeWidth={strokeWidth} fill="none"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        strokeLinecap="round" className="transition-all duration-700 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{value.toFixed(0)}%</span>
                </div>
            </div>
            <span className="text-sm font-medium text-gray-700 mt-2">{label}</span>
            {subLabel && <span className="text-xs text-gray-400">{subLabel}</span>}
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="glass-card p-3 text-sm">
            <p className="text-gray-400 mb-1">{label}</p>
            {payload.map((entry, index) => (
                <p key={index} style={{ color: entry.color }} className="font-medium">
                    {entry.name}: {entry.value.toFixed(1)}%
                </p>
            ))}
        </div>
    );
};

export default function DashboardPage() {
    const [usageHistory, setUsageHistory] = useState([]);
    const historyRef = useRef([]);
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data: systemInfo, isLoading: infoLoading } = useQuery({
        queryKey: ['systemInfo'],
        queryFn: () => api.get('/system/info').then(r => r.data),
        staleTime: 60000,
    });

    const { data: usage } = useQuery({
        queryKey: ['systemUsage'],
        queryFn: () => api.get('/system/usage').then(r => r.data),
        refetchInterval: 3000,
    });

    const { data: mcStatus } = useQuery({
        queryKey: ['minecraftStatus'],
        queryFn: () => api.get('/minecraft/status').then(r => r.data),
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

    const startMutation = useMutation({
        mutationFn: () => api.post('/minecraft/start'),
        onSuccess: () => { toast.success('Sunucu başlatılıyor...'); queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Başlatılamadı'),
    });
    const stopMutation = useMutation({
        mutationFn: () => api.post('/minecraft/stop'),
        onSuccess: () => { toast.success('Sunucu durduruluyor...'); queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Durdurulamadı'),
    });
    const restartMutation = useMutation({
        mutationFn: () => api.post('/minecraft/restart'),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Yeniden başlatılamadı'),
    });
    const repairMutation = useMutation({
        mutationFn: () => api.post('/minecraft/repair'),
        onSuccess: (res) => { toast.success(res.data.message); queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Onarım başarısız'),
    });
    const activateMutation = useMutation({
        mutationFn: (id) => api.post(`/modpacks/activate/${id}`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            queryClient.invalidateQueries({ queryKey: ['activeProfile'] });
            queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil değişimi başarısız'),
    });

    useEffect(() => {
        if (!usage) return;
        const now = new Date();
        const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const entry = { time: timeLabel, cpu: usage.cpu?.currentLoad || 0, ram: usage.memory?.usagePercent || 0 };
        historyRef.current = [...historyRef.current.slice(-29), entry];
        setUsageHistory([...historyRef.current]);
    }, [usage]);

    const cpuPercent = usage?.cpu?.currentLoad || 0;
    const ramPercent = usage?.memory?.usagePercent || 0;
    const mainDisk = usage?.disk?.[0];
    const diskPercent = mainDisk?.usePercent || 0;

    const isRunning = mcStatus?.status === 'running';
    const isStarting = mcStatus?.status === 'starting';
    const isStopping = mcStatus?.status === 'stopping';
    const isStopped = !isRunning && !isStarting && !isStopping;
    const isBusy = isStarting || isStopping || startMutation.isPending || stopMutation.isPending || restartMutation.isPending;
    const serverCpu = mcStatus?.processStats?.cpuPercent || 0;
    const serverRamMB = mcStatus?.processStats?.memoryMB || 0;
    const totalCores = systemInfo?.cpu?.cores || 1;
    const normalizedServerCpu = Math.min(100, +(serverCpu / totalCores).toFixed(1));

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('dashboard.title')}</h1>
                <p className="text-gray-500">{t('dashboard.subtitle')}</p>
            </div>

            {/* Güncelleme Uyarısı */}
            {updateInfo?.hasUpdate && (
                <div className="glass-card p-4 fade-in border-l-4 border-amber-500 bg-amber-50/50">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <HiOutlineExclamationTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-gray-900">Yeni Güncelleme Mevcut!</p>
                                <p className="text-sm text-gray-600">
                                    {updateInfo.currentVersion} → <span className="font-medium text-amber-700">{updateInfo.latestVersion}</span>
                                </p>
                            </div>
                        </div>
                        <a href="/modpacks" className="btn-primary text-sm flex items-center gap-2 flex-shrink-0">
                            <HiOutlineArrowDownTray className="w-4 h-4" /> Güncelle
                        </a>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* SUNUCU DURUMU — Ana Kontrol Kartı */}
            {/* ============================================================ */}
            <div className={`glass-card p-6 fade-in relative overflow-hidden ${isRunning ? 'ring-2 ring-green-400/30' : ''}`}>
                {isRunning && (
                    <div className="absolute top-4 right-4 w-3 h-3">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </div>
                )}

                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    {/* Sol: Durum + Profil + Butonlar */}
                    <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isRunning ? 'bg-green-100' : isStarting ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                <HiOutlineServer className={`w-7 h-7 ${isRunning ? 'text-green-600' : isStarting ? 'text-amber-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="text-xl font-bold text-gray-900">Minecraft Sunucusu</h2>
                                    {/* Profil Seçici */}
                                    {installedData?.modpacks?.length > 0 && (
                                        <div className="relative inline-flex items-center">
                                            <HiOutlinePuzzlePiece className="absolute left-3 text-gray-400 w-4 h-4 pointer-events-none" />
                                            <select
                                                className="bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-9 pr-8 py-1.5 cursor-pointer hover:bg-gray-100 transition-colors"
                                                value={activeProfileData?.profile?.id || ''}
                                                onChange={(e) => {
                                                    const profileId = e.target.value;
                                                    if (!profileId) return;
                                                    if (isRunning && !window.confirm('Açık olan sunucu kapatılıp yeni profil ile başlatılacak. Emin misiniz?')) return;
                                                    activateMutation.mutate(profileId);
                                                }}
                                                disabled={activateMutation.isPending || isStarting || isStopping}
                                            >
                                                <option value="" disabled>Profil Seçin</option>
                                                {installedData.modpacks.map(mp => (
                                                    <option key={mp.id} value={mp.id}>{mp.name} {mp.version}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isRunning ? 'bg-green-100 text-green-700' :
                                            isStarting ? 'bg-amber-100 text-amber-700 animate-pulse' :
                                                isStopping ? 'bg-red-100 text-red-700 animate-pulse' :
                                                    'bg-gray-100 text-gray-500'
                                        }`}>
                                        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : isStarting ? 'bg-amber-500' : isStopping ? 'bg-red-500' : 'bg-gray-400'}`} />
                                        {isRunning ? 'Çalışıyor' : isStarting ? 'Başlatılıyor...' : isStopping ? 'Durduruluyor...' : 'Kapalı'}
                                    </span>
                                    {isRunning && mcStatus?.pid && (
                                        <span className="text-xs text-gray-400">PID: {mcStatus.pid}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Kontrol Butonları */}
                        <div className="flex gap-2 flex-wrap">
                            {isStopped ? (
                                <button onClick={() => startMutation.mutate()} disabled={isBusy}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all bg-green-600 hover:bg-green-700 active:scale-95 disabled:opacity-50">
                                    <HiOutlinePlay className="w-5 h-5" />
                                    {startMutation.isPending ? 'Başlatılıyor...' : 'Sunucuyu Başlat'}
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => stopMutation.mutate()} disabled={!isRunning || isBusy}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all bg-red-500 hover:bg-red-600 active:scale-95 disabled:opacity-50">
                                        <HiOutlineStop className="w-4 h-4" />
                                        {stopMutation.isPending ? 'Durduruluyor...' : 'Durdur'}
                                    </button>
                                    <button onClick={() => restartMutation.mutate()} disabled={isBusy}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 disabled:opacity-50">
                                        <HiOutlineArrowPath className="w-4 h-4" />
                                        {restartMutation.isPending ? 'Başlatılıyor...' : 'Yeniden Başlat'}
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => { if (confirm('Sunucu kurulum dosyaları silinecek ve tekrar başlatılınca yeniden indirilecek. Emin misiniz?')) repairMutation.mutate(); }}
                                disabled={isRunning || isBusy || repairMutation.isPending}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                            >
                                <HiOutlineWrenchScrewdriver className="w-4 h-4" />
                                Onar
                            </button>
                        </div>
                    </div>

                    {/* Sağ: Sunucu Process İstatistikleri */}
                    {isRunning && (
                        <div className="flex items-center gap-8 lg:border-l lg:border-gray-100 lg:pl-8">
                            <div className="text-center">
                                <div className="relative w-20 h-20 mx-auto">
                                    <svg width="80" height="80" className="transform -rotate-90">
                                        <circle cx="40" cy="40" r="32" stroke="#E5E7EB" strokeWidth="6" fill="none" />
                                        <circle cx="40" cy="40" r="32"
                                            stroke={normalizedServerCpu > 80 ? '#EF4444' : normalizedServerCpu > 50 ? '#F59E0B' : '#22C55E'}
                                            strokeWidth="6" fill="none"
                                            strokeDasharray={2 * Math.PI * 32}
                                            strokeDashoffset={2 * Math.PI * 32 - (normalizedServerCpu / 100) * 2 * Math.PI * 32}
                                            strokeLinecap="round" className="transition-all duration-700" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-lg font-bold text-gray-900">{normalizedServerCpu}%</span>
                                    </div>
                                </div>
                                <p className="text-xs font-medium text-gray-500 mt-1">Sunucu CPU</p>
                            </div>
                            <div className="text-center">
                                <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center">
                                    <div>
                                        <p className="text-lg font-bold text-blue-700">{(serverRamMB / 1024).toFixed(1)}</p>
                                        <p className="text-xs text-blue-500 -mt-0.5">GB</p>
                                    </div>
                                </div>
                                <p className="text-xs font-medium text-gray-500 mt-1">Sunucu RAM</p>
                            </div>
                            <div className="text-center">
                                <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center">
                                    <p className="text-2xl font-bold text-amber-700">{mcStatus?.playerCount || 0}</p>
                                </div>
                                <p className="text-xs font-medium text-gray-500 mt-1">Oyuncu</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Online Oyuncular (sunucu açıkken) */}
                {isRunning && mcStatus?.players?.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-3">
                            <HiOutlineUsers className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600">Online Oyuncular</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {mcStatus.players.map((player) => (
                                <div key={player} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                                    <img src={`https://mc-heads.net/avatar/${player}/24`} alt={player} className="w-6 h-6 rounded" loading="lazy" />
                                    <span className="text-sm text-gray-900 font-medium">{player}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ============================================================ */}
            {/* SİSTEM KAYNAKLARI */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-6 fade-in flex flex-col items-center">
                    <CircularProgress value={cpuPercent} label="Sistem CPU"
                        subLabel={systemInfo ? systemInfo.cpu.brand : ''} />
                </div>
                <div className="glass-card p-6 fade-in flex flex-col items-center">
                    <CircularProgress value={ramPercent} label="Sistem RAM" color="#2563EB"
                        subLabel={usage ? `${formatBytes(usage.memory?.used)} / ${formatBytes(usage.memory?.total)}` : ''} />
                </div>
                <div className="glass-card p-6 fade-in flex flex-col items-center">
                    <CircularProgress value={diskPercent} label="Disk" color="#F59E0B"
                        subLabel={mainDisk ? `${formatBytes(mainDisk.used)} / ${formatBytes(mainDisk.size)}` : ''} />
                </div>
            </div>

            {/* ============================================================ */}
            {/* GRAFİK */}
            {/* ============================================================ */}
            <div className="glass-card p-6 fade-in">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Kaynak Kullanım Grafiği</h2>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={usageHistory}>
                            <defs>
                                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#374151" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#374151" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                            <XAxis dataKey="time" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                            <YAxis stroke="#9CA3AF" fontSize={11} domain={[0, 100]} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="cpu" name="CPU" stroke="#374151" strokeWidth={2} fill="url(#cpuGradient)" />
                            <Area type="monotone" dataKey="ram" name="RAM" stroke="#2563EB" strokeWidth={2} fill="url(#ramGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 mt-3 text-sm">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-700" /><span className="text-gray-500">CPU</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600" /><span className="text-gray-500">RAM</span></div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* SİSTEM BİLGİLERİ & BAĞLANTI */}
            {/* ============================================================ */}
            {systemInfo && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="glass-card p-6 fade-in">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <HiOutlineCpuChip className="w-5 h-5 text-gray-500" /> Donanım
                        </h3>
                        <div className="space-y-3">
                            <InfoRow label="İşlemci" value={`${systemInfo.cpu.manufacturer} ${systemInfo.cpu.brand}`} />
                            <InfoRow label="Çekirdek" value={`${systemInfo.cpu.cores} (${systemInfo.cpu.physicalCores} fiziksel)`} />
                            <InfoRow label="Hız" value={`${systemInfo.cpu.speed} GHz (Maks: ${systemInfo.cpu.speedMax} GHz)`} />
                            <InfoRow label="Toplam RAM" value={formatBytes(systemInfo.memory.total)} />
                            <InfoRow label="Uptime" value={usage ? formatUptime(usage.uptime) : '..'} />
                            {usage?.temperature && <InfoRow label="Sıcaklık" value={`${usage.temperature}°C`} />}
                        </div>
                    </div>
                    <div className="glass-card p-6 fade-in">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <HiOutlineServer className="w-5 h-5 text-gray-500" /> İşletim Sistemi
                        </h3>
                        <div className="space-y-3">
                            <InfoRow label="Platform" value={systemInfo.os.platform} />
                            <InfoRow label="Dağıtım" value={`${systemInfo.os.distro} ${systemInfo.os.release}`} />
                            <InfoRow label="Hostname" value={systemInfo.os.hostname} />
                            <InfoRow label="Mimari" value={systemInfo.os.arch} />
                            <InfoRow label="Kernel" value={systemInfo.os.kernel} />
                        </div>
                    </div>
                </div>
            )}

            <ConnectionInfoWidget />

            {infoLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2].map(i => (
                        <div key={i} className="glass-card p-6">
                            <div className="skeleton h-6 w-48 mb-4" />
                            <div className="space-y-3">{[1, 2, 3, 4].map(j => <div key={j} className="skeleton h-4 w-full" />)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 font-medium">{value}</span>
        </div>
    );
}

function ConnectionInfoWidget() {
    const { data } = useQuery({
        queryKey: ['connectionInfo'],
        queryFn: () => api.get('/system/connection-info').then(r => r.data),
        staleTime: 60000,
    });
    if (!data) return null;

    const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success('Kopyalandı!'); };

    return (
        <div className="glass-card p-6 fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HiOutlineSignal className="w-5 h-5 text-green-600" /> Bağlantı Bilgisi
            </h3>
            <div className="space-y-3">
                <InfoRow label="Sunucu IP (Yerel)" value={data.localIp} />
                {data.externalIp && <InfoRow label="Sunucu IP (Dış)" value={data.externalIp} />}
                <InfoRow label="Port" value={data.port} />
                <InfoRow label="Hostname" value={data.hostname} />
                <div className="flex items-center justify-between py-3 bg-gray-50 rounded-xl mt-3 px-4">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Bağlantı Komutu</p>
                        <code className="text-sm font-mono font-bold text-gray-900">{data.connectCommand}</code>
                    </div>
                    <button onClick={() => copyToClipboard(data.connectCommand)} className="btn-primary text-xs py-2 px-3">Kopyala</button>
                </div>
            </div>
        </div>
    );
}
