import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import {
    HiOutlineCpuChip, HiOutlineCircleStack, HiOutlineServerStack,
    HiOutlineUsers, HiOutlineBoltSlash, HiOutlineBolt, HiOutlineFolder,
} from 'react-icons/hi2';

async function fetchPerformance() {
    const { data } = await api.get('/system/performance');
    return data;
}

function Sparkline({ values, color = '#6366f1', height = 40 }) {
    if (!values || values.length < 2) {
        return <div style={{ height }} className="flex items-end opacity-20 text-xs text-gray-400">veri bekleniyor...</div>;
    }
    const w = 240, h = height;
    const max = Math.max(...values, 0.1);
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - (v / 100) * h;
        return `${x},${y}`;
    });
    const area = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
    const line = `M${pts.join(' L')}`;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
            <defs>
                <linearGradient id={`g-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#g-${color.replace('#', '')})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function MetricCard({ icon: Icon, label, value, sub, color, bar, sparkValues, sparkColor }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
                </div>
                {sub && <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
            {bar !== undefined && (
                <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(bar, 100)}%`, background: bar > 85 ? '#ef4444' : bar > 60 ? '#f59e0b' : '#10b981' }}
                    />
                </div>
            )}
            {sparkValues && (
                <div className="mt-1 opacity-80">
                    <Sparkline values={sparkValues} color={sparkColor} height={36} />
                </div>
            )}
        </div>
    );
}

function TpsCard({ tps }) {
    const val = tps?.one;
    const color = val === null ? 'text-gray-400' : val >= 19 ? 'text-emerald-500' : val >= 15 ? 'text-amber-500' : 'text-red-500';
    const label = val === null ? '—' : val >= 19 ? 'Mükemmel' : val >= 15 ? 'Orta' : 'Düşük';
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                    <HiOutlineBolt className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">TPS</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>
                {val !== null ? val?.toFixed(2) : '—'}
            </div>
            <div className="flex gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span>1m: <span className={color}>{tps?.one?.toFixed(1) ?? '—'}</span></span>
                <span>5m: <span className={color}>{tps?.five?.toFixed(1) ?? '—'}</span></span>
                <span>15m: <span className={color}>{tps?.fifteen?.toFixed(1) ?? '—'}</span></span>
            </div>
            <div className={`text-xs font-medium ${color}`}>{val !== null ? label : 'Yalnızca Paper/Spigot'}</div>
        </div>
    );
}

function McStatusCard({ mc }) {
    const statusMap = {
        running:  { label: 'Çalışıyor',   color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
        starting: { label: 'Başlıyor',    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500 animate-pulse' },
        stopping: { label: 'Kapanıyor',   color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
        stopped:  { label: 'Durduruldu',  color: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',          dot: 'bg-gray-400' },
    };
    const s = statusMap[mc?.status] || statusMap.stopped;
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    <HiOutlineServerStack className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">MC Sunucu</span>
            </div>
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-lg ${s.color}`}>{s.label}</span>
            </div>
            <div className="flex gap-4 text-sm">
                <div>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">Oyuncu</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{mc?.players ?? 0}</p>
                </div>
                <div>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">Java Bellek</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{mc?.javaMem ? `${mc.javaMem} MB` : '—'}</p>
                </div>
                <div>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">Java CPU</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{mc?.javaCpu ? `${mc.javaCpu}%` : '—'}</p>
                </div>
            </div>
        </div>
    );
}

const FOLDER_COLORS = {
    world: '#10b981', world_nether: '#ef4444', world_the_end: '#8b5cf6',
    mods: '#f59e0b', config: '#6366f1', logs: '#64748b',
    backups: '#06b6d4', plugins: '#ec4899', 'crash-reports': '#f97316',
    diğer: '#94a3b8',
};

function DiskAnalysisPanel() {
    const { data, isLoading } = useQuery({
        queryKey: ['disk-analysis'],
        queryFn: () => api.get('/worlds/disk').then(r => r.data),
        refetchInterval: 60000,
    });

    if (isLoading) return (
        <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
    );

    if (!data) return null;

    return (
        <div className="space-y-4">
            {data.sysDisk && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sistem Diski</h3>
                        <span className="text-xs text-gray-400">{data.sysDisk.usedGB} / {data.sysDisk.totalGB} GB</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(data.sysDisk.percent, 100)}%`, background: data.sysDisk.percent > 85 ? '#ef4444' : data.sysDisk.percent > 60 ? '#f59e0b' : '#10b981' }}
                        />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
                        <span>Kullanılan: {data.sysDisk.percent?.toFixed(1)}%</span>
                        <span>Boş: {(data.sysDisk.totalGB - data.sysDisk.usedGB).toFixed(1)} GB</span>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sunucu Klasörleri</h3>
                    <span className="text-xs text-gray-400">Toplam: {data.totalFormatted}</span>
                </div>

                {/* Stacked bar */}
                {data.folders.length > 0 && (
                    <div className="flex h-4 w-full rounded-full overflow-hidden mb-4 gap-px">
                        {data.folders.map(f => (
                            <div key={f.name} title={`${f.name}: ${f.formatted}`}
                                className="transition-all duration-500"
                                style={{ width: `${f.percent}%`, background: FOLDER_COLORS[f.name] || '#94a3b8', minWidth: f.percent > 1 ? '2px' : 0 }}
                            />
                        ))}
                    </div>
                )}

                <div className="space-y-2">
                    {data.folders.map(f => (
                        <div key={f.name} className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: FOLDER_COLORS[f.name] || '#94a3b8' }} />
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <HiOutlineFolder className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{f.formatted}</span>
                                <span className="text-xs text-gray-400 ml-2">{f.percent}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function PerformancePage() {
    const { data, isLoading } = useQuery({
        queryKey: ['performance'],
        queryFn: fetchPerformance,
        refetchInterval: 3000,
        refetchIntervalInBackground: true,
    });

    const [activeTab, setActiveTab] = useState('live');
    const cpuHistory = data?.history?.map(h => h.cpu) ?? [];
    const ramHistory = data?.history?.map(h => h.ram) ?? [];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performans Monitörü</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerçek zamanlı sistem kaynakları</p>
                </div>
            </div>

            <div className="flex gap-2">
                {[{ id: 'live', label: 'Canlı' }, { id: 'disk', label: 'Disk Analizi' }].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === t.id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'disk' && <DiskAnalysisPanel />}

            {activeTab === 'live' && (isLoading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <MetricCard
                            icon={HiOutlineCpuChip}
                            label="CPU Kullanımı"
                            value={`${data?.cpu?.toFixed(1) ?? '—'}%`}
                            color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                            bar={data?.cpu}
                            sparkValues={cpuHistory}
                            sparkColor="#6366f1"
                        />
                        <MetricCard
                            icon={HiOutlineCircleStack}
                            label="RAM Kullanımı"
                            value={`${data?.ram?.percent?.toFixed(1) ?? '—'}%`}
                            sub={data?.ram ? `${data.ram.usedMB} / ${data.ram.totalMB} MB` : undefined}
                            color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                            bar={data?.ram?.percent}
                            sparkValues={ramHistory}
                            sparkColor="#10b981"
                        />
                        <TpsCard tps={data?.mc?.tps} />
                        <McStatusCard mc={data?.mc} />
                    </div>

                    {data?.disk && (
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Disk Kullanımı</h2>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                                        <span>{data.disk.usedGB} GB kullanılıyor</span>
                                        <span>{data.disk.totalGB} GB toplam</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${Math.min(data.disk.percent, 100)}%`,
                                                background: data.disk.percent > 85 ? '#ef4444' : data.disk.percent > 60 ? '#f59e0b' : '#10b981',
                                            }}
                                        />
                                    </div>
                                </div>
                                <span className="text-lg font-bold text-gray-900 dark:text-white w-16 text-right">
                                    {data.disk.percent?.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">CPU Geçmişi</h2>
                                <span className="text-xs text-gray-400">son 3 dakika</span>
                            </div>
                            <Sparkline values={cpuHistory} color="#6366f1" height={80} />
                            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                                <span>3dk önce</span><span>şimdi</span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">RAM Geçmişi</h2>
                                <span className="text-xs text-gray-400">son 3 dakika</span>
                            </div>
                            <Sparkline values={ramHistory} color="#10b981" height={80} />
                            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                                <span>3dk önce</span><span>şimdi</span>
                            </div>
                        </div>
                    </div>
                </>
            ))}
        </div>
    );
}
