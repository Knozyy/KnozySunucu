import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineGlobeAlt, HiOutlineTrash, HiOutlineArchiveBox,
    HiOutlineCircleStack,
} from 'react-icons/hi2';

export default function WorldsPage() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['worlds'],
        queryFn: () => api.get('/worlds').then(r => r.data),
    });

    const resetMutation = useMutation({
        mutationFn: (worldName) => api.post('/worlds/reset', { worldName }),
        onSuccess: (res) => { toast.success(res.data.message); queryClient.invalidateQueries({ queryKey: ['worlds'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Sıfırlanamadı'),
    });

    const backupMutation = useMutation({
        mutationFn: (worldName) => api.post('/worlds/backup', { worldName }),
        onSuccess: (res) => toast.success(res.data.message),
        onError: (err) => toast.error(err.response?.data?.error || 'Yedeklenemedi'),
    });

    const worlds = data?.worlds || [];
    const totalSize = data?.totalSize;

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('worlds.title')}</h1>
                <p className="text-gray-500">
                    {worlds.length} dünya{totalSize ? ` — Toplam ${totalSize.formatted}` : ''}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="glass-card p-6"><div className="skeleton h-6 w-32 mb-3" /><div className="skeleton h-4 w-24" /></div>
                    ))
                ) : worlds.length > 0 ? worlds.map(world => (
                    <div key={world.name} className="glass-card p-6 fade-in">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                                <HiOutlineGlobeAlt className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">{world.name}</h3>
                                <p className="text-sm text-gray-500">{world.sizeFormatted}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => backupMutation.mutate(world.name)}
                                disabled={backupMutation.isPending}
                                className="btn-secondary text-xs flex-1"
                            >
                                <HiOutlineArchiveBox className="w-4 h-4" /> Yedekle
                            </button>
                            <button
                                onClick={() => { if (confirm(`${world.name} kalıcı olarak SİLİNECEK. Yeni dünya oluşmak için sunucuyu yeniden başlatmanız gerekecek. Emin misiniz?`)) resetMutation.mutate(world.name); }}
                                disabled={resetMutation.isPending}
                                className="btn-danger text-xs"
                            >
                                <HiOutlineTrash className="w-4 h-4" /> Sıfırla
                            </button>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full text-center py-12 text-gray-400">
                        <HiOutlineGlobeAlt className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>Dünya bulunamadı</p>
                    </div>
                )}
            </div>

            {/* Total Size */}
            {totalSize && (
                <div className="glass-card p-5 flex items-center gap-4 fade-in">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                        <HiOutlineCircleStack className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Toplam Dünya Boyutu</p>
                        <p className="text-xl font-bold text-gray-900">{totalSize.formatted}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
