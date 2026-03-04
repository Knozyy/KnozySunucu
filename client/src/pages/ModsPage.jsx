import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlinePuzzlePiece, HiOutlineTrash, HiOutlineCheck,
    HiOutlineXMark,
} from 'react-icons/hi2';

function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ModsPage() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['mods'],
        queryFn: () => api.get('/mods').then(r => r.data),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ name, enabled }) => enabled ? api.post('/mods/disable', { name }) : api.post('/mods/enable', { name }),
        onSuccess: () => { toast.success('Güncellendi'); queryClient.invalidateQueries({ queryKey: ['mods'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'İşlem başarısız'),
    });

    const deleteMutation = useMutation({
        mutationFn: (name) => api.delete(`/mods/${encodeURIComponent(name)}`),
        onSuccess: () => { toast.success('Mod silindi'); queryClient.invalidateQueries({ queryKey: ['mods'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Silinemedi'),
    });

    const mods = data?.mods || [];
    const count = data?.count || { active: 0, disabled: 0, total: 0 };

    return (
        <div className="space-y-6">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Mod Yönetimi</h1>
                    <p className="text-gray-500">{count.active} aktif, {count.disabled} devre dışı — toplam {count.total} mod</p>
                </div>
            </div>

            {/* Mod List */}
            <div className="glass-card overflow-hidden fade-in">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
                ) : mods.length > 0 ? mods.map(mod => (
                    <div key={mod.name} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors group">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mod.enabled ? 'bg-green-50' : 'bg-gray-100'}`}>
                            <HiOutlinePuzzlePiece className={`w-4 h-4 ${mod.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${mod.enabled ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{mod.name}</p>
                            <p className="text-xs text-gray-400">{formatSize(mod.size)}</p>
                        </div>
                        <button
                            onClick={() => toggleMutation.mutate({ name: mod.name, enabled: mod.enabled })}
                            className={`p-2 rounded-lg transition-colors ${mod.enabled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                            title={mod.enabled ? 'Devre dışı bırak' : 'Aktif et'}
                        >
                            {mod.enabled ? <HiOutlineCheck className="w-4 h-4" /> : <HiOutlineXMark className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => { if (confirm(`${mod.name} kalıcı olarak silinecek. Emin misiniz?`)) deleteMutation.mutate(mod.name); }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-2"
                        >
                            <HiOutlineTrash className="w-4 h-4" />
                        </button>
                    </div>
                )) : (
                    <div className="p-8 text-center text-gray-400">
                        <HiOutlinePuzzlePiece className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>mods/ klasöründe mod bulunamadı</p>
                    </div>
                )}
            </div>
        </div>
    );
}
