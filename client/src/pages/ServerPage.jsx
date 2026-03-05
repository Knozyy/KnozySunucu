import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlinePlay,
    HiOutlineStop,
    HiOutlineArrowPath,
    HiOutlineUsers,
    HiOutlineSignal,
    HiOutlineWrenchScrewdriver,
    HiOutlineCpuChip,
    HiOutlineCircleStack,
    HiOutlinePuzzlePiece,
} from 'react-icons/hi2';

export default function ServerPage() {
    const queryClient = useQueryClient();

    const { data: status } = useQuery({
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

    const startMutation = useMutation({
        mutationFn: () => api.post('/minecraft/start'),
        onSuccess: () => {
            toast.success('Sunucu başlatılıyor...');
            queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Başlatılamadı'),
    });

    const stopMutation = useMutation({
        mutationFn: () => api.post('/minecraft/stop'),
        onSuccess: () => {
            toast.success('Sunucu durduruluyor...');
            queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Durdurulamadı'),
    });

    const restartMutation = useMutation({
        mutationFn: () => api.post('/minecraft/restart'),
        onSuccess: () => {
            toast.success('Sunucu yeniden başlatılıyor...');
            queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yeniden başlatılamadı'),
    });

    const repairMutation = useMutation({
        mutationFn: () => api.post('/minecraft/repair'),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['minecraftStatus'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Onarım başarısız'),
    });

    const isRunning = status?.status === 'running';
    const isStarting = status?.status === 'starting';
    const isStopping = status?.status === 'stopping';
    const isBusy = isStarting || isStopping || startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

    const getStatusColor = () => {
        if (isRunning) return 'text-green-600';
        if (isStarting || isStopping) return 'text-amber-600';
        return 'text-red-500';
    };

    const getStatusText = () => {
        if (isRunning) return 'Çalışıyor';
        if (isStarting) return 'Başlatılıyor...';
        if (isStopping) return 'Durduruluyor...';
        return 'Kapalı';
    };

    const getStatusGlow = () => {
        if (isRunning) return 'glow-green';
        if (isStarting || isStopping) return 'glow-amber';
        return 'glow-red';
    };

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('server.title')}</h1>
                <p className="text-gray-500">{t('server.subtitle')}</p>
            </div>

            {/* Status card */}
            <div className={`glass-card p-8 fade-in ${getStatusGlow()}`}>
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${isRunning ? 'bg-green-50' : 'bg-red-50'}`}>
                        <HiOutlineSignal className={`w-10 h-10 ${getStatusColor()}`} />
                    </div>

                    <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2 justify-center md:justify-start">
                            <h2 className="text-2xl font-bold text-gray-900">Sunucu Durumu</h2>

                            {installedData?.modpacks?.length > 0 && (
                                <div className="relative inline-flex items-center">
                                    <HiOutlinePuzzlePiece className="absolute left-3 text-gray-400 w-4 h-4" />
                                    <select
                                        className="bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-primary-500 focus:border-primary-500 block pl-9 pr-8 py-1.5 cursor-pointer hover:bg-gray-100 transition-colors"
                                        value={activeProfileData?.profile?.id || ''}
                                        onChange={(e) => {
                                            const profileId = e.target.value;
                                            if (!profileId) return;
                                            if (isRunning && !window.confirm('Açık olan sunucu kapatılıp yeni profil ile başlatılacak. Emin misiniz?')) {
                                                return;
                                            }
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
                        <p className={`text-lg font-semibold ${getStatusColor()}`}>
                            {(isStarting || isStopping) && (
                                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                            )}
                            {getStatusText()}
                        </p>
                        {status?.pid && <p className="text-xs text-gray-400 mt-1">PID: {status.pid}</p>}
                    </div>

                    <div className="flex gap-3 flex-wrap justify-center">
                        <button onClick={() => startMutation.mutate()} disabled={isRunning || isBusy} className="btn-primary">
                            <HiOutlinePlay className="w-5 h-5" /> Başlat
                        </button>
                        <button onClick={() => stopMutation.mutate()} disabled={!isRunning || isBusy} className="btn-danger">
                            <HiOutlineStop className="w-5 h-5" /> Durdur
                        </button>
                        <button onClick={() => restartMutation.mutate()} disabled={isBusy} className="btn-secondary">
                            <HiOutlineArrowPath className="w-5 h-5" /> Yeniden Başlat
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('Sunucu kurulum dosyaları (kütüphaneler) silinecek ve tekrar başladığında yeniden indirilecek. Emin misiniz?')) {
                                    repairMutation.mutate();
                                }
                            }}
                            disabled={isRunning || isBusy || repairMutation.isPending}
                            className="bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <HiOutlineWrenchScrewdriver className="w-5 h-5" /> Onar
                        </button>
                    </div>
                </div>
            </div>

            {/* Process Stats */}
            {isRunning && status?.processStats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 fade-in">
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <HiOutlineCpuChip className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Sunucu CPU</p>
                            <p className="text-xl font-bold text-gray-900">{status.processStats.cpuPercent || 0}%</p>
                        </div>
                    </div>
                    <div className="glass-card p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                            <HiOutlineCircleStack className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Sunucu RAM</p>
                            <p className="text-xl font-bold text-gray-900">{status.processStats.memoryMB || 0} MB</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Players */}
            <div className="glass-card p-6 fade-in">
                <div className="flex items-center gap-3 mb-4">
                    <HiOutlineUsers className="w-6 h-6 text-amber-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                        Online Oyuncular ({status?.playerCount || 0})
                    </h2>
                </div>

                {status?.players?.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {status.players.map((player) => (
                            <div key={player} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                                <img src={`https://mc-heads.net/avatar/${player}/32`} alt={player} className="w-8 h-8 rounded-lg" loading="lazy" />
                                <span className="text-sm text-gray-900 font-medium truncate">{player}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        <HiOutlineUsers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>{isRunning ? 'Şu anda online oyuncu yok' : 'Sunucu kapalı'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
