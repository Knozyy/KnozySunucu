import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { formatBytes, formatUptime } from '@/utils/formatters';
import {
    HiOutlineCpuChip,
    HiOutlineCircleStack,
    HiOutlineServer,
    HiOutlineClock,
    HiOutlineSignal,
    HiOutlineUsers,
    HiOutlineArrowDownTray,
    HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useState, useEffect, useRef } from 'react';

function StatCard({ icon: Icon, label, value, subValue, color, percentage }) {
    const colorMap = {
        primary: { bg: 'bg-gray-100', text: 'text-gray-700' },
        info: { bg: 'bg-blue-50', text: 'text-blue-600' },
        accent: { bg: 'bg-amber-50', text: 'text-amber-600' },
        'primary-light': { bg: 'bg-gray-50', text: 'text-gray-500' },
        danger: { bg: 'bg-red-50', text: 'text-red-500' },
        success: { bg: 'bg-green-50', text: 'text-green-600' },
    };

    const c = colorMap[color] || colorMap.primary;

    return (
        <div className="stat-card fade-in">
            <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${c.text}`} />
                </div>
                {percentage !== undefined && (
                    <span className={`text-sm font-semibold ${percentage > 80 ? 'text-red-500' : percentage > 60 ? 'text-amber-500' : 'text-green-500'}`}>
                        {percentage.toFixed(1)}%
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
            {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
            {percentage !== undefined && (
                <div className="progress-bar mt-3">
                    <div
                        className="progress-bar-fill"
                        style={{
                            width: `${Math.min(percentage, 100)}%`,
                            background: percentage > 80
                                ? 'linear-gradient(90deg, #DC2626, #B91C1C)'
                                : percentage > 60
                                    ? 'linear-gradient(90deg, #D97706, #B45309)'
                                    : 'linear-gradient(90deg, #16A34A, #15803D)',
                        }}
                    />
                </div>
            )}
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
        refetchInterval: 5000,
    });

    const { data: updateInfo } = useQuery({
        queryKey: ['modpackUpdate'],
        queryFn: () => api.post('/modpacks/check-update', {}).then(r => r.data),
        refetchInterval: 300000, // 5 dakikada bir kontrol
        retry: false,
    });

    useEffect(() => {
        if (!usage) return;

        const now = new Date();
        const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const entry = {
            time: timeLabel,
            cpu: usage.cpu?.currentLoad || 0,
            ram: usage.memory?.usagePercent || 0,
        };

        historyRef.current = [...historyRef.current.slice(-19), entry];
        setUsageHistory([...historyRef.current]);
    }, [usage]);

    const cpuPercent = usage?.cpu?.currentLoad || 0;
    const ramPercent = usage?.memory?.usagePercent || 0;
    const mainDisk = usage?.disk?.[0];
    const diskPercent = mainDisk?.usePercent || 0;

    const { t } = useI18n();

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

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard
                    icon={HiOutlineCpuChip}
                    label="CPU Kullanımı"
                    value={`${cpuPercent.toFixed(1)}%`}
                    subValue={systemInfo ? `${systemInfo.cpu.brand}` : ''}
                    color="primary"
                    percentage={cpuPercent}
                />
                <StatCard
                    icon={HiOutlineCircleStack}
                    label="RAM Kullanımı"
                    value={usage ? formatBytes(usage.memory?.used) : '..'}
                    subValue={usage ? `/ ${formatBytes(usage.memory?.total)}` : ''}
                    color="info"
                    percentage={ramPercent}
                />
                <StatCard
                    icon={HiOutlineServer}
                    label="Disk Kullanımı"
                    value={mainDisk ? formatBytes(mainDisk.used) : '..'}
                    subValue={mainDisk ? `/ ${formatBytes(mainDisk.size)}` : ''}
                    color="accent"
                    percentage={diskPercent}
                />
                <StatCard
                    icon={HiOutlineClock}
                    label="Uptime"
                    value={usage ? formatUptime(usage.uptime) : '..'}
                    subValue={systemInfo?.os?.distro || ''}
                    color="primary-light"
                />
                <StatCard
                    icon={HiOutlineSignal}
                    label="Sunucu Durumu"
                    value={mcStatus?.status === 'running' ? 'Çalışıyor' : mcStatus?.status === 'starting' ? 'Başlıyor' : 'Kapalı'}
                    subValue={mcStatus?.status === 'running' ? 'Aktif' : ''}
                    color={mcStatus?.status === 'running' ? 'success' : 'danger'}
                />
                <StatCard
                    icon={HiOutlineUsers}
                    label="Oyuncular"
                    value={mcStatus?.playerCount?.toString() || '0'}
                    subValue="Online"
                    color="accent"
                />
            </div>

            {/* Chart */}
            <div className="glass-card p-6 fade-in">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Kaynak Kullanım Grafiği</h2>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={usageHistory}>
                            <defs>
                                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#374151" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#374151" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                            <YAxis stroke="#9CA3AF" fontSize={12} domain={[0, 100]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="cpu" name="CPU" stroke="#374151" strokeWidth={2} fill="url(#cpuGradient)" />
                            <Area type="monotone" dataKey="ram" name="RAM" stroke="#2563EB" strokeWidth={2} fill="url(#ramGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-700" />
                        <span className="text-gray-500">CPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-600" />
                        <span className="text-gray-500">RAM</span>
                    </div>
                </div>
            </div>

            {/* System info */}
            {systemInfo && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="glass-card p-6 fade-in">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Donanım Bilgileri</h3>
                        <div className="space-y-3">
                            <InfoRow label="İşlemci" value={`${systemInfo.cpu.manufacturer} ${systemInfo.cpu.brand}`} />
                            <InfoRow label="Çekirdek" value={`${systemInfo.cpu.cores} (${systemInfo.cpu.physicalCores} fiziksel)`} />
                            <InfoRow label="Hız" value={`${systemInfo.cpu.speed} GHz (Maks: ${systemInfo.cpu.speedMax} GHz)`} />
                            <InfoRow label="Toplam RAM" value={formatBytes(systemInfo.memory.total)} />
                            {usage?.temperature && <InfoRow label="Sıcaklık" value={`${usage.temperature}°C`} />}
                        </div>
                    </div>

                    <div className="glass-card p-6 fade-in">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">İşletim Sistemi</h3>
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

            {/* Connection Info */}
            <ConnectionInfoWidget />

            {infoLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2].map(i => (
                        <div key={i} className="glass-card p-6">
                            <div className="skeleton h-6 w-48 mb-4" />
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(j => (
                                    <div key={j} className="skeleton h-4 w-full" />
                                ))}
                            </div>
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Kopyalandı!');
    };

    return (
        <div className="glass-card p-6 fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HiOutlineSignal className="w-5 h-5 text-green-600" />
                Bağlantı Bilgisi
            </h3>
            <div className="space-y-3">
                <InfoRow label="Sunucu IP (Yerel)" value={data.localIp} />
                {data.externalIp && <InfoRow label="Sunucu IP (Dış)" value={data.externalIp} />}
                <InfoRow label="Port" value={data.port} />
                <InfoRow label="Hostname" value={data.hostname} />
                <div className="flex items-center justify-between py-3 bg-gray-50 dark:bg-gray-800 rounded-xl mt-3 px-4">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Bağlantı Komutu</p>
                        <code className="text-sm font-mono font-bold text-gray-900 dark:text-white">{data.connectCommand}</code>
                    </div>
                    <button
                        onClick={() => copyToClipboard(data.connectCommand)}
                        className="btn-primary text-xs py-2 px-3"
                    >
                        Kopyala
                    </button>
                </div>
            </div>
        </div>
    );
}
