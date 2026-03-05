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
    const [ramSettings, setRamSettings] = useState({ minRam: '', maxRam: '', jvmArgs: '' });
    const [ramSystem, setRamSystem] = useState(null);
    const queryClient = useQueryClient();
    const { t } = useI18n();

    // server.properties
    const { data: properties, isLoading } = useQuery({
        queryKey: ['serverProperties'],
        queryFn: () => api.get('/minecraft/properties').then(r => r.data),
        onSuccess: (data) => setEditedProps(data),
    });

    // RAM ayarları (tek endpoint — akıllı varsayılanlar dahil)
    const { data: currentRam } = useQuery({
        queryKey: ['ramSettings'],
        queryFn: () => api.get('/system/ram-settings').then(r => r.data),
        onSuccess: (data) => {
            setRamSettings({ minRam: data.minRam, maxRam: data.maxRam, jvmArgs: data.jvmArgs });
            setRamSystem(data.system);
        },
    });

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

    const handleSaveAll = () => {
        savePropertiesMutation.mutate(editedProps);
        saveRamMutation.mutate(ramSettings);
    };

    const currentProps = { ...properties, ...editedProps };
    const hasChanges = JSON.stringify(properties) !== JSON.stringify(editedProps)
        || JSON.stringify({ minRam: currentRam?.minRam, maxRam: currentRam?.maxRam, jvmArgs: currentRam?.jvmArgs }) !== JSON.stringify(ramSettings);
    const isSaving = savePropertiesMutation.isPending || saveRamMutation.isPending;

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
                {/* Sol: RAM & JVM */}
                <div className="space-y-6 fade-in">
                    {/* RAM Ayarları — tek yer */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <HiOutlineCircleStack className="w-5 h-5 text-blue-600" />
                            RAM Ayarları
                        </h2>

                        {/* Sistem bilgisi (sadece bilgilendirme) */}
                        {ramSystem && (
                            <div className="mb-4 px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-500">
                                Sistem RAM: <span className="font-semibold text-gray-900">{ramSystem.totalGB} GB</span>
                                <span className="mx-2">•</span>
                                Max verilebilir: <span className="font-semibold text-gray-900">{ramSystem.maxAllocatable} GB</span>
                                <span className="text-xs ml-1 text-gray-400">(toplam - 2GB OS)</span>
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
                        <p className="text-xs text-gray-400 mt-3">
                            Örn: 4G, 8G, 12G. Max RAM = toplam sistem RAM - 2GB (OS için) olarak önerilir.
                        </p>
                    </div>

                    {/* JVM Argümanları */}
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
                            Boş bırakırsanız varsayılan JVM ayarları kullanılır.
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
