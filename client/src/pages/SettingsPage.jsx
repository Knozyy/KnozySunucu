import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineCog6Tooth,
    HiOutlineArrowPath,
    HiOutlineCpuChip,
    HiOutlineCircleStack,
    HiOutlineSparkles,
} from 'react-icons/hi2';

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
    const [ramSettings, setRamSettings] = useState({ minRam: '2G', maxRam: '4G', jvmArgs: '' });
    const queryClient = useQueryClient();

    // server.properties
    const { data: properties, isLoading } = useQuery({
        queryKey: ['serverProperties'],
        queryFn: () => api.get('/minecraft/properties').then(r => r.data),
        onSuccess: (data) => setEditedProps(data),
    });

    // RAM ayarları
    const { data: currentRam } = useQuery({
        queryKey: ['ramSettings'],
        queryFn: () => api.get('/system/ram-settings').then(r => r.data),
        onSuccess: (data) => setRamSettings(data),
    });

    // RAM önerisi
    const { data: ramRecommendation } = useQuery({
        queryKey: ['ramRecommendation'],
        queryFn: () => api.get('/system/ram-recommendation').then(r => r.data),
    });

    // Kaydetme
    const savePropertiesMutation = useMutation({
        mutationFn: (props) => api.put('/minecraft/properties', props),
        onSuccess: () => {
            toast.success('Server properties kaydedildi!');
            queryClient.invalidateQueries({ queryKey: ['serverProperties'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaydetme başarısız'),
    });

    const saveRamMutation = useMutation({
        mutationFn: (settings) => api.put('/system/ram-settings', settings),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['ramSettings'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'RAM ayarları güncellenemedi'),
    });

    const handlePropChange = (key, value) => {
        setEditedProps(prev => ({ ...prev, [key]: value }));
    };

    const handleRamChange = (key, value) => {
        setRamSettings(prev => ({ ...prev, [key]: value }));
    };

    const applyRecommendation = () => {
        if (!ramRecommendation) return;
        const rec = ramRecommendation.recommended;
        setRamSettings({
            minRam: `${rec.minGB}G`,
            maxRam: `${rec.maxGB}G`,
            jvmArgs: ramRecommendation.jvmArgs,
        });
        toast.success('Önerilen RAM ayarları uygulandı');
    };

    const handleSaveAll = () => {
        savePropertiesMutation.mutate(editedProps);
        saveRamMutation.mutate(ramSettings);
    };

    const currentProps = { ...properties, ...editedProps };
    const hasChanges = JSON.stringify(properties) !== JSON.stringify(editedProps)
        || JSON.stringify(currentRam) !== JSON.stringify(ramSettings);
    const isSaving = savePropertiesMutation.isPending || saveRamMutation.isPending;

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('settings.title')}</h1>
                    <p className="text-gray-500">{t('settings.subtitle')}</p>
                </div>
                <button onClick={handleSaveAll} disabled={!hasChanges || isSaving} className="btn-primary">
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <><HiOutlineCog6Tooth className="w-5 h-5" /> Tümünü Kaydet</>
                    )}
                </button>
            </div>

            {hasChanges && (
                <div className="glass-card p-3 border-amber-200 bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
                    <HiOutlineArrowPath className="w-4 h-4" />
                    Kaydedilmemiş değişiklikler var. Değişikliklerin etkili olması için sunucuyu yeniden başlatın.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sol: RAM & JVM Ayarları */}
                <div className="space-y-6 fade-in">
                    {/* RAM Ayarları */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <HiOutlineCircleStack className="w-5 h-5 text-blue-600" />
                            RAM Ayarları
                        </h2>

                        {/* Öneri kutusu */}
                        {ramRecommendation && (
                            <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-blue-700 font-medium text-sm flex items-center gap-1">
                                        <HiOutlineSparkles className="w-4 h-4" />
                                        Sistem RAM Bilgisi
                                    </span>
                                    <button onClick={applyRecommendation} className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-100 rounded-lg transition-colors">
                                        Önerileni Uygula
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-gray-500">Toplam:</span>
                                        <span className="ml-1 font-semibold text-gray-900">{ramRecommendation.system.totalGB} GB</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Boş:</span>
                                        <span className="ml-1 font-semibold text-gray-900">{ramRecommendation.system.availableGB} GB</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Önerilen Min:</span>
                                        <span className="ml-1 font-bold text-blue-700">{ramRecommendation.recommended.minGB} GB</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Önerilen Max:</span>
                                        <span className="ml-1 font-bold text-blue-700">{ramRecommendation.recommended.maxGB} GB</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Min RAM</label>
                                <input
                                    type="text"
                                    value={ramSettings.minRam}
                                    onChange={e => handleRamChange('minRam', e.target.value)}
                                    className="input-field"
                                    placeholder="2G"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Max RAM</label>
                                <input
                                    type="text"
                                    value={ramSettings.maxRam}
                                    onChange={e => handleRamChange('maxRam', e.target.value)}
                                    className="input-field"
                                    placeholder="4G"
                                />
                            </div>
                        </div>
                    </div>

                    {/* JVM Ayarları */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <HiOutlineCpuChip className="w-5 h-5 text-gray-600" />
                            JVM Argümanları
                        </h2>
                        <textarea
                            value={ramSettings.jvmArgs}
                            onChange={e => handleRamChange('jvmArgs', e.target.value)}
                            className="input-field h-32 font-mono text-xs resize-none"
                            placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled ..."
                        />
                        <p className="text-xs text-gray-400 mt-2">
                            Boş bırakırsanız varsayılan JVM ayarları kullanılır. "Önerileni Uygula" ile optimize edilmiş ayarlar otomatik doldurulur.
                        </p>
                    </div>
                </div>

                {/* Sağ: server.properties */}
                <div className="fade-in">
                    {isLoading ? (
                        <div className="glass-card p-6">
                            <div className="space-y-4">
                                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
                            </div>
                        </div>
                    ) : (
                        <div className="glass-card p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <HiOutlineCog6Tooth className="w-5 h-5 text-gray-600" />
                                Oyun Ayarları (server.properties)
                            </h2>
                            <div className="space-y-3">
                                {Object.entries(currentProps).map(([key, value]) => {
                                    const meta = PROPERTY_LABELS[key];
                                    const label = meta?.label || key;
                                    const type = meta?.type || 'text';

                                    return (
                                        <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
                                            <label className="text-sm text-gray-700 flex-shrink-0" htmlFor={`prop-${key}`}>
                                                {label}
                                            </label>
                                            <div className="flex-shrink-0">
                                                {type === 'boolean' ? (
                                                    <button
                                                        onClick={() => handlePropChange(key, value === 'true' ? 'false' : 'true')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${value === 'true' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                                                            }`}
                                                    >
                                                        {value === 'true' ? 'Aktif' : 'Kapalı'}
                                                    </button>
                                                ) : type === 'select' ? (
                                                    <select id={`prop-${key}`} value={value} onChange={e => handlePropChange(key, e.target.value)} className="input-field text-sm py-1.5 w-32">
                                                        {meta.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                ) : (
                                                    <input id={`prop-${key}`} type={type} value={value} onChange={e => handlePropChange(key, e.target.value)} className="input-field text-sm py-1.5 w-40" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
