import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatNumber, formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineArrowDownTray,
    HiOutlineTrash,
    HiOutlineFire,
    HiOutlinePuzzlePiece,
    HiOutlineCog6Tooth,
    HiOutlinePlay,
    HiOutlineCheckCircle,
    HiOutlineXMark,
    HiOutlineChevronDown,
} from 'react-icons/hi2';

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatFileDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

export default function ModpacksPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('search');
    const [editingModpack, setEditingModpack] = useState(null);
    const [confirmSwitch, setConfirmSwitch] = useState(null);
    const [versionModal, setVersionModal] = useState(null); // { modpack, files, loading }
    const queryClient = useQueryClient();
    const { t } = useI18n();

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

    const { data: activeProfileData } = useQuery({
        queryKey: ['activeProfile'],
        queryFn: () => api.get('/modpacks/active').then(r => r.data),
    });

    const installMutation = useMutation({
        mutationFn: ({ modId, fileId }) => api.post('/modpacks/install', { modId, fileId }),
        onSuccess: () => {
            toast.success('Kurulum başlatıldı! İlerlemeyi takip edebilirsiniz.');
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            setVersionModal(null);
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const [isPolling, setIsPolling] = useState(false);

    const { data: installStatusData } = useQuery({
        queryKey: ['installStatus'],
        queryFn: () => api.get('/modpacks/install-status').then(r => {
            const d = r.data;
            setIsPolling(d.isInstalling);
            return d;
        }),
        refetchInterval: isPolling ? 1000 : false,
    });

    const uninstallMutation = useMutation({
        mutationFn: (id) => api.delete(`/modpacks/${id}`),
        onSuccess: () => {
            toast.success('Modpack kaldırıldı');
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            queryClient.invalidateQueries({ queryKey: ['activeProfile'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaldırma başarısız'),
    });

    const activateMutation = useMutation({
        mutationFn: (id) => api.post(`/modpacks/activate/${id}`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            setConfirmSwitch(null);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            queryClient.invalidateQueries({ queryKey: ['activeProfile'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil değişimi başarısız'),
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

    const openVersionModal = async (modpack) => {
        setVersionModal({ modpack, files: [], loading: true });
        try {
            const res = await api.get(`/modpacks/${modpack.id}/files`);
            setVersionModal({ modpack, files: res.data.files || [], loading: false });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sürümler alınamadı');
            setVersionModal(null);
        }
    };

    const handleInstallVersion = (modpack, fileId) => {
        installMutation.mutate({ modId: modpack.id, fileId });
    };

    const handleActivate = (modpack) => {
        if (activeProfileData?.serverStatus === 'running') {
            setConfirmSwitch(modpack);
        } else {
            activateMutation.mutate(modpack.id);
        }
    };

    const modpacksToShow = activeTab === 'search'
        ? (searchResults?.modpacks || popularData?.modpacks || [])
        : (installedData?.modpacks || []);

    const isInstalling = installMutation.isPending || installStatusData?.isInstalling;

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('modpacks.title')}</h1>
                <p className="text-gray-500">{t('modpacks.subtitle')}</p>
            </div>

            {/* Aktif Profil Banner */}
            {activeProfileData?.profile && (
                <div className="glass-card p-4 border-l-4 border-green-500 fade-in">
                    <div className="flex items-center gap-3">
                        <HiOutlineCheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">
                                Aktif Profil: <span className="text-green-600">{activeProfileData.profile.name}</span>
                            </p>
                            <p className="text-xs text-gray-400">{activeProfileData.profile.install_path}</p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${activeProfileData.serverStatus === 'running' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                            {activeProfileData.serverStatus === 'running' ? '🟢 Çalışıyor' : '⚫ Kapalı'}
                        </span>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 fade-in">
                <button
                    onClick={() => setActiveTab('search')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'search' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <HiOutlineMagnifyingGlass className="w-4 h-4 inline mr-2" />
                    Ara & Yükle
                </button>
                <button
                    onClick={() => setActiveTab('installed')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'installed' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <HiOutlinePuzzlePiece className="w-4 h-4 inline mr-2" />
                    Profiller ({installedData?.modpacks?.length || 0})
                </button>
            </div>

            {/* Search Bar */}
            {activeTab === 'search' && (
                <form onSubmit={handleSearch} className="fade-in">
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                className="input-field pl-12" placeholder="Modpack adı ara... (örn: RLCraft, All the Mods)" />
                        </div>
                        <button type="submit" disabled={searching || !searchQuery.trim()} className="btn-primary">
                            {searching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Ara'}
                        </button>
                    </div>
                </form>
            )}

            {/* Kurulum İlerleme Çubuğu */}
            {(isInstalling || (installStatusData?.progress > 0 && installStatusData?.progress < 100)) && (
                <div className="glass-card p-5 fade-in border-l-4 border-gray-900">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">{installStatusData?.task || 'Kurulum'}</p>
                            <p className="text-xs text-gray-500">{installStatusData?.status || 'İşleniyor...'}</p>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{installStatusData?.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${installStatusData?.progress || 0}%`, background: 'linear-gradient(90deg, #1F2937, #374151)' }} />
                    </div>
                </div>
            )}

            {installStatusData?.progress === 100 && !installStatusData?.isInstalling && (
                <div className="glass-card p-4 bg-green-50/50 border-l-4 border-green-500 fade-in">
                    <p className="text-sm font-medium text-green-700">✅ {installStatusData?.status || 'Kurulum tamamlandı!'}</p>
                </div>
            )}

            {installStatusData?.error && (
                <div className="glass-card p-4 bg-red-50/50 border-l-4 border-red-500 fade-in">
                    <p className="text-sm font-medium text-red-700">❌ {installStatusData.error}</p>
                </div>
            )}

            {editingModpack && (
                <ModpackSettingsModal
                    modpack={editingModpack}
                    onClose={() => setEditingModpack(null)}
                    onSave={(settings) => updateSettingsMutation.mutate({ id: editingModpack.id, settings })}
                    saving={updateSettingsMutation.isPending}
                />
            )}

            {/* Profil Geçiş Onay Modalı */}
            {confirmSwitch && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmSwitch(null)}>
                    <div className="glass-card p-6 w-full max-w-md fade-in" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-gray-900 mb-3">⚠️ Sunucu Açık</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Şu an <strong>{activeProfileData?.profile?.name}</strong> çalışıyor.
                            <strong> {confirmSwitch.name}</strong> profiline geçmek için açık sunucu
                            <strong> save alınıp kapatılacak</strong>. Devam etmek istiyor musunuz?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setConfirmSwitch(null)} className="btn-secondary">İptal</button>
                            <button
                                onClick={() => activateMutation.mutate(confirmSwitch.id)}
                                disabled={activateMutation.isPending}
                                className="btn-primary"
                            >
                                {activateMutation.isPending ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Geçiliyor...
                                    </div>
                                ) : 'Evet, Geçiş Yap'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sürüm Seçim Modalı */}
            {versionModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVersionModal(null)}>
                    <div className="glass-card p-6 w-full max-w-lg max-h-[80vh] flex flex-col fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <HiOutlineChevronDown className="w-5 h-5 text-blue-600" />
                                Sürüm Seç — {versionModal.modpack.name}
                            </h2>
                            <button onClick={() => setVersionModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                                <HiOutlineXMark className="w-5 h-5" />
                            </button>
                        </div>

                        {versionModal.loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                                <span className="ml-3 text-sm text-gray-600">Sürümler yükleniyor...</span>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                                {versionModal.files.length > 0 ? versionModal.files.map(file => (
                                    <div key={file.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{file.displayName}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className="text-xs text-gray-400">{formatSize(file.fileLength)}</span>
                                                <span className="text-xs text-gray-400">{formatFileDate(file.fileDate)}</span>
                                                {file.gameVersions?.slice(0, 3).map((v, i) => (
                                                    <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">{v}</span>
                                                ))}
                                                {file.serverPackFileId && (
                                                    <span className="text-xs bg-green-100 px-2 py-0.5 rounded-full text-green-700 font-medium">Server Pack</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleInstallVersion(versionModal.modpack, file.id)}
                                            disabled={installMutation.isPending}
                                            className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                                        >
                                            {installMutation.isPending ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <HiOutlineArrowDownTray className="w-3.5 h-3.5" />
                                                    Yükle
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 text-gray-400">
                                        <p>Sürüm bulunamadı</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
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
                            isActive={modpack.is_active === 1}
                            onInstall={() => openVersionModal(modpack)}
                            onUninstall={() => uninstallMutation.mutate(modpack.id)}
                            onSettings={() => setEditingModpack(modpack)}
                            onActivate={() => handleActivate(modpack)}
                            installing={installMutation.isPending}
                            uninstalling={uninstallMutation.isPending}
                            activating={activateMutation.isPending}
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

function ModpackCard({ modpack, isInstalled, isActive, onInstall, onUninstall, onSettings, onActivate, installing, uninstalling, activating }) {
    return (
        <div className={`glass-card p-4 fade-in group relative ${isActive ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}>
            {/* Aktif Badge */}
            {isActive && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5" /> AKTİF
                </div>
            )}

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
                    <h3 className="text-gray-900 font-semibold truncate">{modpack.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{modpack.summary || modpack.version || 'Açıklama yok'}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        {modpack.author && <span>👤 {modpack.author}</span>}
                        {modpack.downloadCount && <span>📥 {formatNumber(modpack.downloadCount)}</span>}
                        {modpack.installed_at && <span>📅 {formatDate(modpack.installed_at)}</span>}
                    </div>

                    {modpack.install_path && (
                        <p className="text-xs text-gray-300 mt-1 truncate">📁 {modpack.install_path}</p>
                    )}

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
                        {!isActive && (
                            <button onClick={onActivate} disabled={activating} className="btn-primary text-xs py-1.5 px-3">
                                <HiOutlinePlay className="w-4 h-4" /> Aktif Yap
                            </button>
                        )}
                        <button onClick={onSettings} className="btn-secondary text-xs py-1.5 px-3">
                            <HiOutlineCog6Tooth className="w-4 h-4" /> Ayarlar
                        </button>
                        <button onClick={onUninstall} disabled={uninstalling} className="btn-danger text-xs py-1.5 px-3">
                            <HiOutlineTrash className="w-4 h-4" /> Kaldır
                        </button>
                    </>
                ) : (
                    <button onClick={onInstall} disabled={installing} className="btn-primary text-xs py-1.5 px-3">
                        <HiOutlineChevronDown className="w-4 h-4" />
                        Sürüm Seç & Yükle
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
