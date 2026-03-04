import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { HiOutlineCog6Tooth, HiOutlineArrowPath } from 'react-icons/hi2';

const PROPERTY_LABELS = {
    'server-port': { label: 'Sunucu Portu', type: 'number' },
    'max-players': { label: 'Maksimum Oyuncu', type: 'number' },
    'motd': { label: 'Sunucu Mesajı (MOTD)', type: 'text' },
    'difficulty': { label: 'Zorluk', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
    'gamemode': { label: 'Oyun Modu', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
    'white-list': { label: 'Whitelist', type: 'boolean' },
    'online-mode': { label: 'Online Mod', type: 'boolean' },
    'pvp': { label: 'PvP', type: 'boolean' },
    'spawn-monsters': { label: 'Canavar Doğması', type: 'boolean' },
    'spawn-animals': { label: 'Hayvan Doğması', type: 'boolean' },
    'level-name': { label: 'Dünya Adı', type: 'text' },
    'level-seed': { label: 'Dünya Seed', type: 'text' },
    'view-distance': { label: 'Görüş Mesafesi', type: 'number' },
    'simulation-distance': { label: 'Simülasyon Mesafesi', type: 'number' },
    'server-ip': { label: 'Sunucu IP', type: 'text' },
    'enable-command-block': { label: 'Komut Bloğu', type: 'boolean' },
    'allow-flight': { label: 'Uçuşa İzin', type: 'boolean' },
    'allow-nether': { label: 'Nether', type: 'boolean' },
};

export default function SettingsPage() {
    const [editedProps, setEditedProps] = useState({});
    const queryClient = useQueryClient();

    const { data: properties, isLoading } = useQuery({
        queryKey: ['serverProperties'],
        queryFn: () => api.get('/minecraft/properties').then(r => r.data),
        onSuccess: (data) => setEditedProps(data),
    });

    const saveMutation = useMutation({
        mutationFn: (props) => api.put('/minecraft/properties', props),
        onSuccess: () => {
            toast.success('Ayarlar kaydedildi! Değişikliklerin etkili olması için sunucuyu yeniden başlatın.');
            queryClient.invalidateQueries({ queryKey: ['serverProperties'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaydetme başarısız'),
    });

    const handleChange = (key, value) => {
        setEditedProps(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        saveMutation.mutate(editedProps);
    };

    const currentProps = { ...properties, ...editedProps };
    const hasChanges = JSON.stringify(properties) !== JSON.stringify(editedProps);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Sunucu Ayarları</h1>
                    <p className="text-gray-500">server.properties dosyasını düzenle</p>
                </div>
                <button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending} className="btn-primary">
                    {saveMutation.isPending ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <><HiOutlineCog6Tooth className="w-5 h-5" /> Kaydet</>
                    )}
                </button>
            </div>

            {hasChanges && (
                <div className="glass-card p-3 border-amber-200 bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
                    <HiOutlineArrowPath className="w-4 h-4" />
                    Kaydedilmemiş değişiklikler var. Değişikliklerin etkili olması için sunucuyu yeniden başlatın.
                </div>
            )}

            {isLoading ? (
                <div className="glass-card p-6">
                    <div className="space-y-4">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
                    </div>
                </div>
            ) : (
                <div className="glass-card p-6 fade-in">
                    <div className="space-y-4">
                        {Object.entries(currentProps).map(([key, value]) => {
                            const meta = PROPERTY_LABELS[key];
                            const label = meta?.label || key;
                            const type = meta?.type || 'text';

                            return (
                                <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center py-3 border-b border-gray-100 last:border-0">
                                    <label className="text-sm font-medium text-gray-700" htmlFor={`prop-${key}`}>
                                        {label}
                                        <span className="block text-xs text-gray-400 font-normal mt-0.5">{key}</span>
                                    </label>
                                    <div className="md:col-span-2">
                                        {type === 'boolean' ? (
                                            <button
                                                onClick={() => handleChange(key, value === 'true' ? 'false' : 'true')}
                                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${value === 'true' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                                                    }`}
                                            >
                                                {value === 'true' ? 'Aktif' : 'Devre Dışı'}
                                            </button>
                                        ) : type === 'select' ? (
                                            <select id={`prop-${key}`} value={value} onChange={(e) => handleChange(key, e.target.value)} className="input-field">
                                                {meta.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        ) : (
                                            <input id={`prop-${key}`} type={type} value={value} onChange={(e) => handleChange(key, e.target.value)} className="input-field" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
