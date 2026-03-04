import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatNumber, formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineArrowDownTray,
    HiOutlineTrash,
    HiOutlineFire,
    HiOutlinePuzzlePiece,
    HiOutlineCog6Tooth,
} from 'react-icons/hi2';

export default function ModpacksPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('search');
    const [editingModpack, setEditingModpack] = useState(null);
    const queryClient = useQueryClient();

    const { data: searchResults, isLoading: searching, refetch: doSearch } = useQuery({
        queryKey: ['modpackSearch', searchQuery],
        queryFn: () => api.get(`/modpacks/search?query=${encodeURIComponent(searchQuery)}`).then(r => r.data),
        enabled: false,
    });

    const { data: popularData, isLoading: loadingPopular } = useQuery({
        queryKey: ['modpackPopular'],
        queryFn: () => api.get('/modpacks/popular').then(r => r.data),
        staleTime: 300000,
    });

    const { data: installedData, isLoading: loadingInstalled } = useQuery({
        queryKey: ['modpackInstalled'],
        queryFn: () => api.get('/modpacks/installed').then(r => r.data),
    });

    const installMutation = useMutation({
        mutationFn: ({ modId, fileId }) => api.post('/modpacks/install', { modId, fileId }),
        onSuccess: (res) => {
            toast.success(`${res.data.name} yüklendi!`);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const uninstallMutation = useMutation({
        mutationFn: (id) => api.delete(`/modpacks/${id}`),
        onSuccess: () => {
            toast.success('Modpack kaldırıldı');
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaldırma başarısız'),
    });

    const updateSettingsMutation = useMutation({
        mutationFn: ({ id, settings }) => api.put(`/modpacks/${id}/settings`, settings),
        onSuccess: () => {
            toast.success('Modpack ayarları güncellendi');
            setEditingModpack(null);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncelleme başarısız'),
    });

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        doSearch();
    };

    const handleInstall = (modpack) => {
        const latestFile = modpack.latestFiles?.[0];
        if (!latestFile) {
            toast.error('İndirilebilir dosya bulunamadı');
            return;
        }
        installMutation.mutate({ modId: modpack.id, fileId: latestFile.id });
    };

    const modpacksToShow = activeTab === 'search'
        ? (searchResults?.modpacks || popularData?.modpacks || [])
        : (installedData?.modpacks || []);

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Modpack Yönetimi</h1>
                <p className="text-gray-500">CurseForge modpack&apos;leri arayın ve yönetin</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 fade-in">
                <button
                    onClick={() => setActiveTab('search')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'search' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                >
                    <HiOutlineMagnifyingGlass className="w-4 h-4 inline mr-2" />
                    Ara & Yükle
                </button>
                <button
                    onClick={() => setActiveTab('installed')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'installed' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                >
                    <HiOutlinePuzzlePiece className="w-4 h-4 inline mr-2" />
                    Yüklü ({installedData?.modpacks?.length || 0})
                </button>
            </div>

            {/* Search Bar */}
            {activeTab === 'search' && (
                <form onSubmit={handleSearch} className="fade-in">
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input-field pl-12"
                                placeholder="Modpack adı ara... (örn: RLCraft, All the Mods)"
                            />
                        </div>
                        <button type="submit" disabled={searching || !searchQuery.trim()} className="btn-primary">
                            {searching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Ara'}
                        </button>
                    </div>
                </form>
            )}

            {installMutation.isPending && (
                <div className="glass-card p-4 border-gray-300 fade-in">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-700 font-medium">Modpack yükleniyor... Bu işlem birkaç dakika sürebilir.</span>
                    </div>
                </div>
            )}

            {/* Modpack Settings Modal */}
            {editingModpack && (
                <ModpackSettingsModal
                    modpack={editingModpack}
                    onClose={() => setEditingModpack(null)}
                    onSave={(settings) => updateSettingsMutation.mutate({ id: editingModpack.id, settings })}
                    saving={updateSettingsMutation.isPending}
                />
            )}

            {activeTab === 'search' && !searchResults && !searching && (
                <div className="fade-in">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <HiOutlineFire className="w-5 h-5 text-amber-500" />
                        Popüler Modpackler
                    </h3>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(searching || loadingPopular || loadingInstalled) ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="glass-card p-4">
                            <div className="flex gap-4">
                                <div className="skeleton w-16 h-16 rounded-xl flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="skeleton h-5 w-3/4" />
                                    <div className="skeleton h-4 w-full" />
                                    <div className="skeleton h-4 w-1/2" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : modpacksToShow.length > 0 ? (
                    modpacksToShow.map((modpack) => (
                        <ModpackCard
                            key={modpack.id}
                            modpack={modpack}
                            isInstalled={activeTab === 'installed'}
                            onInstall={() => handleInstall(modpack)}
                            onUninstall={() => uninstallMutation.mutate(modpack.id)}
                            onSettings={() => setEditingModpack(modpack)}
                            installing={installMutation.isPending}
                            uninstalling={uninstallMutation.isPending}
                        />
                    ))
                ) : (
                    <div className="col-span-full text-center py-12 text-gray-400">
                        <HiOutlinePuzzlePiece className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-lg">
                            {activeTab === 'installed' ? 'Henüz yüklü modpack yok' : 'Aramak için yukarıdaki arama çubuğunu kullanın'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ModpackCard({ modpack, isInstalled, onInstall, onUninstall, onSettings, installing, uninstalling }) {
    return (
        <div className="glass-card p-4 fade-in group">
            <div className="flex gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    {(modpack.logoUrl || modpack.logo_url) ? (
                        <img src={modpack.logoUrl || modpack.logo_url} alt={modpack.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <HiOutlinePuzzlePiece className="w-8 h-8 text-gray-300" />
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-gray-900 font-semibold truncate group-hover:text-gray-600 transition-colors">{modpack.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{modpack.summary || modpack.version || 'Açıklama yok'}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        {modpack.author && <span>👤 {modpack.author}</span>}
                        {modpack.downloadCount && <span>📥 {formatNumber(modpack.downloadCount)}</span>}
                        {modpack.installed_at && <span>📅 {formatDate(modpack.installed_at)}</span>}
                    </div>

                    {modpack.latestFiles?.[0]?.gameVersions && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                            {modpack.latestFiles[0].gameVersions.slice(0, 3).map((v, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-500">{v}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
                {isInstalled ? (
                    <>
                        <button onClick={onSettings} className="btn-secondary text-xs py-1.5 px-3">
                            <HiOutlineCog6Tooth className="w-4 h-4" /> Ayarlar
                        </button>
                        <button onClick={onUninstall} disabled={uninstalling} className="btn-danger text-xs py-1.5 px-3">
                            <HiOutlineTrash className="w-4 h-4" /> Kaldır
                        </button>
                    </>
                ) : (
                    <button onClick={onInstall} disabled={installing} className="btn-primary text-xs py-1.5 px-3">
                        <HiOutlineArrowDownTray className="w-4 h-4" /> Yükle
                    </button>
                )}
            </div>
        </div>
    );
}

function ModpackSettingsModal({ modpack, onClose, onSave, saving }) {
    const [settings, setSettings] = useState({
        name: modpack.name || '',
        version: modpack.version || '',
        maxRam: '4G',
        minRam: '2G',
        jvmArgs: '',
        autoRestart: false,
    });

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="glass-card p-6 w-full max-w-lg fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <HiOutlineCog6Tooth className="w-6 h-6" />
                    {modpack.name} - Ayarlar
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Modpack Adı</label>
                        <input type="text" value={settings.name} onChange={e => handleChange('name', e.target.value)} className="input-field" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Versiyon</label>
                        <input type="text" value={settings.version} onChange={e => handleChange('version', e.target.value)} className="input-field" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max RAM</label>
                            <input type="text" value={settings.maxRam} onChange={e => handleChange('maxRam', e.target.value)} className="input-field" placeholder="4G" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Min RAM</label>
                            <input type="text" value={settings.minRam} onChange={e => handleChange('minRam', e.target.value)} className="input-field" placeholder="2G" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">JVM Argümanları</label>
                        <input type="text" value={settings.jvmArgs} onChange={e => handleChange('jvmArgs', e.target.value)} className="input-field" placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled" />
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleChange('autoRestart', !settings.autoRestart)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${settings.autoRestart ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                                }`}
                        >
                            {settings.autoRestart ? 'Otomatik Yeniden Başlatma: Aktif' : 'Otomatik Yeniden Başlatma: Kapalı'}
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 mt-6 justify-end">
                    <button onClick={onClose} className="btn-secondary">İptal</button>
                    <button onClick={() => onSave(settings)} disabled={saving} className="btn-primary">
                        {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}
