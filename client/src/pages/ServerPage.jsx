import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlinePlay,
    HiOutlineStop,
    HiOutlineArrowPath,
    HiOutlineUsers,
    HiOutlineSignal,
} from 'react-icons/hi2';

export default function ServerPage() {
    const queryClient = useQueryClient();

    const { data: status } = useQuery({
        queryKey: ['minecraftStatus'],
        queryFn: () => api.get('/minecraft/status').then(r => r.data),
        refetchInterval: 3000,
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

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Sunucu Kontrol</h1>
                <p className="text-gray-500">Minecraft sunucusunu yönet</p>
            </div>

            {/* Status card */}
            <div className={`glass-card p-8 fade-in ${getStatusGlow()}`}>
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${isRunning ? 'bg-green-50' : 'bg-red-50'}`}>
                        <HiOutlineSignal className={`w-10 h-10 ${getStatusColor()}`} />
                    </div>

                    <div className="flex-1 text-center md:text-left">
                        <h2 className="text-2xl font-bold text-gray-900 mb-1">Sunucu Durumu</h2>
                        <p className={`text-lg font-semibold ${getStatusColor()}`}>
                            {(isStarting || isStopping) && (
                                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                            )}
                            {getStatusText()}
                        </p>
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
                    </div>
                </div>
            </div>

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
