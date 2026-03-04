import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatBytes, formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { HiOutlineArchiveBox, HiOutlinePlus, HiOutlineTrash, HiOutlineArrowPath } from 'react-icons/hi2';

export default function BackupPage() {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data, isLoading } = useQuery({
        queryKey: ['backups'],
        queryFn: () => api.get('/backup/list').then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (name) => api.post('/backup/create', { name }),
        onSuccess: () => { toast.success('Yedekleme oluşturuldu!'); queryClient.invalidateQueries({ queryKey: ['backups'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Yedekleme oluşturulamadı'),
    });

    const restoreMutation = useMutation({
        mutationFn: (id) => api.post(`/backup/restore/${id}`),
        onSuccess: () => toast.success('Yedek geri yüklendi! Sunucuyu yeniden başlatın.'),
        onError: (err) => toast.error(err.response?.data?.error || 'Geri yükleme başarısız'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/backup/${id}`),
        onSuccess: () => { toast.success('Yedek silindi'); queryClient.invalidateQueries({ queryKey: ['backups'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Silme başarısız'),
    });

    const handleCreate = () => {
        const name = prompt('Yedek adı (boş bırakılabilir):');
        createMutation.mutate(name || undefined);
    };

    const handleRestore = (backup) => {
        if (window.confirm(`"${backup.name}" yedeğini geri yüklemek istediğinize emin misiniz?`)) {
            restoreMutation.mutate(backup.id);
        }
    };

    const handleDelete = (backup) => {
        if (window.confirm(`"${backup.name}" yedeğini silmek istediğinize emin misiniz?`)) {
            deleteMutation.mutate(backup.id);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('nav.backup')}</h1>
                    <p className="text-gray-500">Dünya ve konfigürasyon yedeklerini yönet</p>
                </div>
                <button onClick={handleCreate} disabled={createMutation.isPending} className="btn-primary">
                    {createMutation.isPending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiOutlinePlus className="w-5 h-5" /> Yeni Yedek</>}
                </button>
            </div>

            {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card p-4"><div className="skeleton h-16 w-full" /></div>)}</div>
            ) : data?.backups?.length > 0 ? (
                <div className="space-y-3 fade-in">
                    {data.backups.map((backup) => (
                        <div key={backup.id} className="glass-card p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <HiOutlineArchiveBox className="w-6 h-6 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-gray-900 font-semibold truncate">{backup.name}</h3>
                                <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                                    <span>{formatBytes(backup.size)}</span>
                                    <span>{formatDate(backup.created_at)}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button onClick={() => handleRestore(backup)} disabled={restoreMutation.isPending} className="btn-secondary text-xs py-1.5 px-3">
                                    <HiOutlineArrowPath className="w-4 h-4" /> Geri Yükle
                                </button>
                                <button onClick={() => handleDelete(backup)} disabled={deleteMutation.isPending} className="btn-danger text-xs py-1.5 px-3">
                                    <HiOutlineTrash className="w-4 h-4" /> Sil
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass-card p-12 text-center text-gray-400 fade-in">
                    <HiOutlineArchiveBox className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg mb-2">Henüz yedek yok</p>
                    <p className="text-sm">İlk yedeği oluşturmak için yukarıdaki butona tıklayın</p>
                </div>
            )}
        </div>
    );
}
