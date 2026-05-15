import { useState, useEffect, useRef } from 'react';
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
    HiOutlineArrowPath,
    HiOutlineWrenchScrewdriver,
    HiOutlineShieldCheck,
    HiOutlineExclamationTriangle,
    HiOutlineInformationCircle,
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
    const [provider, setProvider] = useState('curseforge'); // 'curseforge' or 'ftb'
    const [editingModpack, setEditingModpack] = useState(null);
    const [confirmSwitch, setConfirmSwitch] = useState(null);
    const [versionModal, setVersionModal] = useState(null);
    const [updateVersionModal, setUpdateVersionModal] = useState(null);
    const [validationModal, setValidationModal] = useState(null); // { modpack, loading, analysis }
    const [repairModal, setRepairModal] = useState(null); // { modpackId, repairId, analysisResult }
    const [repairPolling, setRepairPolling] = useState(false);
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data: searchResults, isLoading: searching, refetch: doSearch } = useQuery({
        queryKey: ['modpackSearch', searchQuery, provider],
        queryFn: () => api.get(`/modpacks/search?query=${encodeURIComponent(searchQuery)}&provider=${provider}`).then(r => r.data),
        enabled: false,
    });

    const { data: popularData, isLoading: loadingPopular } = useQuery({
        queryKey: ['modpackPopular', provider],
        queryFn: () => api.get(`/modpacks/popular?provider=${provider}`).then(r => r.data),
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
        mutationFn: ({ modId, fileId, providerParam }) => api.post('/modpacks/install', { modId, fileId, provider: providerParam }),
        onSuccess: () => {
            toast.success('Kurulum başlatıldı!');
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            setVersionModal(null);
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const [isPolling, setIsPolling] = useState(false);

    const { data: installStatusData } = useQuery({
        queryKey: ['installStatus', provider],
        queryFn: () => api.get(`/modpacks/install-status?provider=${provider}`).then(r => {
            const d = r.data;
            setIsPolling(d.isInstalling);
            return d;
        }),
        refetchInterval: isPolling ? 1000 : false,
    });

    const uninstallMutation = useMutation({
        mutationFn: (id) => api.delete(`/modpacks/${id}`),
        onSuccess: () => {
            toast.success('Modpack kaldırıldı (dosyalar silindi)');
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

    const updateModpackMutation = useMutation({
        mutationFn: ({ dbId, modId, fileId }) => api.post('/modpacks/update', { dbId, modId, fileId }),
        onSuccess: () => {
            toast.success('Modpack güncellendi!');
            setUpdateVersionModal(null);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            queryClient.invalidateQueries({ queryKey: ['activeProfile'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncelleme başarısız'),
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

    // Onarım durumu polling
    const { data: repairStatusData } = useQuery({
        queryKey: ['repairStatus', repairModal?.repairId],
        queryFn: () => api.get(`/modpacks/${repairModal.modpackId}/repair-status/${repairModal.repairId}`).then(r => {
            const d = r.data;
            if (d.done) setRepairPolling(false);
            return d;
        }),
        enabled: !!repairModal?.repairId && repairPolling,
        refetchInterval: repairPolling ? 800 : false,
    });

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        doSearch();
    };

    const openVersionModal = async (modpack) => {
        setVersionModal({ modpack, files: [], loading: true });
        try {
            const res = await api.get(`/modpacks/${modpack.id}/files?provider=${provider}`);
            setVersionModal({ modpack, files: res.data.files || [], loading: false });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sürümler alınamadı');
            setVersionModal(null);
        }
    };

    // Yüklü modpack sürüm değiştirme
    const openUpdateVersionModal = async (modpack) => {
        if (!modpack.curseforge_id) {
            toast.error('Bu modpack kayıt ID bulunamadı');
            return;
        }
        setUpdateVersionModal({ modpack, files: [], loading: true });
        try {
            const targetProvider = modpack.provider || 'curseforge';
            const res = await api.get(`/modpacks/${modpack.curseforge_id}/files?provider=${targetProvider}`);
            setUpdateVersionModal({ modpack, files: res.data.files || [], loading: false });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sürümler alınamadı');
            setUpdateVersionModal(null);
        }
    };

    const handleInstallVersion = (modpack, fileId) => {
        installMutation.mutate({ modId: modpack.id, fileId, providerParam: provider });
    };

    const handleUpdateVersion = (modpack, fileId) => {
        updateModpackMutation.mutate({
            dbId: modpack.id,
            modId: modpack.curseforge_id,
            fileId,
        });
    };

    const openValidationModal = async (modpack) => {
        setValidationModal({ modpack, loading: true, analysis: null });
        try {
            const res = await api.get(`/modpacks/${modpack.id}/analyze`);
            setValidationModal({ modpack, loading: false, analysis: res.data });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Analiz başarısız');
            setValidationModal(null);
        }
    };

    const handleRepair = async (selectedIssueIds, analysisResult, modpack) => {
        try {
            const res = await api.post(`/modpacks/${modpack.id}/repair`, { selectedIssueIds, analysisResult });
            const { repairId } = res.data;
            setValidationModal(null);
            setRepairModal({ modpackId: modpack.id, repairId, analysisResult });
            setRepairPolling(true);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Onarım başlatılamadı');
        }
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
                                {activeProfileData.profile.server_port && activeProfileData.profile.server_port !== 25565 && (
                                    <span className="text-xs text-gray-400 ml-2">Port: {activeProfileData.profile.server_port}</span>
                                )}
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

                {activeTab === 'search' && (
                    <div className="ml-auto flex items-center bg-gray-100 rounded-xl p-1">
                        <button
                            onClick={() => setProvider('curseforge')}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'curseforge' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            CurseForge
                        </button>
                        <button
                            onClick={() => setProvider('ftb')}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${provider === 'ftb' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            Feed The Beast
                        </button>
                    </div>
                )}

                {activeTab === 'installed' && (
                    <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] })}
                        className="ml-auto px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all flex items-center gap-2"
                        title="Listeyi Yenile"
                    >
                        <HiOutlineArrowPath className="w-4 h-4" /> Yenile
                    </button>
                )}
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

            {/* Yeni Kurulum Sürüm Seçim Modalı */}
            {versionModal && (
                <VersionSelectModal
                    title={`Sürüm Seç — ${versionModal.modpack.name}`}
                    files={versionModal.files}
                    loading={versionModal.loading}
                    onClose={() => setVersionModal(null)}
                    onSelect={(fileId) => handleInstallVersion(versionModal.modpack, fileId)}
                    isPending={installMutation.isPending}
                    buttonLabel="Yükle"
                />
            )}

            {/* Doğrulama & Onarım Modalı */}
            {validationModal && (
                <ValidationModal
                    modpack={validationModal.modpack}
                    loading={validationModal.loading}
                    analysis={validationModal.analysis}
                    onClose={() => setValidationModal(null)}
                    onRepair={(selectedIds) => handleRepair(selectedIds, validationModal.analysis, validationModal.modpack)}
                />
            )}

            {/* Onarım İlerleme Modalı */}
            {repairModal && (
                <RepairProgressModal
                    status={repairStatusData}
                    modpackId={repairModal.modpackId}
                    onClose={() => {
                        setRepairModal(null);
                        setRepairPolling(false);
                        queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
                    }}
                />
            )}

            {/* Yüklü Modpack Sürüm Değiştirme Modalı */}
            {updateVersionModal && (
                <VersionSelectModal
                    title={`Sürüm Değiştir — ${updateVersionModal.modpack.name}`}
                    subtitle={`Mevcut: ${updateVersionModal.modpack.file_display_name || updateVersionModal.modpack.version}`}
                    files={updateVersionModal.files}
                    loading={updateVersionModal.loading}
                    onClose={() => setUpdateVersionModal(null)}
                    onSelect={(fileId) => handleUpdateVersion(updateVersionModal.modpack, fileId)}
                    isPending={updateModpackMutation.isPending}
                    buttonLabel="Güncelle"
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
                            isActive={modpack.is_active === 1}
                            onInstall={() => openVersionModal(modpack)}
                            onUninstall={() => {
                                if (confirm(`${modpack.name} kalıcı olarak kaldırılacak ve tüm dosyaları silinecek. Emin misiniz?`)) {
                                    uninstallMutation.mutate(modpack.id);
                                }
                            }}
                            onSettings={() => setEditingModpack(modpack)}
                            onActivate={() => handleActivate(modpack)}
                            onChangeVersion={() => openUpdateVersionModal(modpack)}
                            onValidate={() => openValidationModal(modpack)}
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

// Reusable Version Select Modal
function VersionSelectModal({ title, subtitle, files, loading, onClose, onSelect, isPending, buttonLabel }) {
    const [selectedFileId, setSelectedFileId] = useState(null);

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="glass-card p-6 w-full max-w-lg max-h-[80vh] flex flex-col fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <HiOutlineChevronDown className="w-5 h-5 text-blue-600" />
                            {title}
                        </h2>
                        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                        <span className="ml-3 text-sm text-gray-600">Sürümler yükleniyor...</span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                        {files.length > 0 ? files.map(file => (
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
                                    onClick={() => {
                                        setSelectedFileId(file.id);
                                        onSelect(file.id);
                                    }}
                                    disabled={isPending}
                                    className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                                >
                                    {isPending && selectedFileId === file.id ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <HiOutlineArrowDownTray className="w-3.5 h-3.5" />
                                            {buttonLabel}
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
    );
}

function ModpackCard({ modpack, isInstalled, isActive, onInstall, onUninstall, onSettings, onActivate, onChangeVersion, onValidate, installing, uninstalling, activating }) {
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

                    {modpack.server_port && modpack.server_port !== 25565 && (
                        <p className="text-xs text-blue-400 mt-1">🔌 Port: {modpack.server_port}</p>
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

            <div className="mt-4 flex gap-2 justify-end flex-wrap">
                {isInstalled ? (
                    <>
                        {!isActive && (
                            <button onClick={onActivate} disabled={activating} className="btn-primary text-xs py-1.5 px-3">
                                <HiOutlinePlay className="w-4 h-4" /> Aktif Yap
                            </button>
                        )}
                        <button onClick={onValidate} className="btn-secondary text-xs py-1.5 px-3" title="Modpack dosyalarını doğrula ve eksiklikleri onar">
                            <HiOutlineWrenchScrewdriver className="w-4 h-4" /> Doğrula & Onar
                        </button>
                        <button onClick={onChangeVersion} className="btn-secondary text-xs py-1.5 px-3">
                            <HiOutlineArrowPath className="w-4 h-4" /> Sürüm Değiştir
                        </button>
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

// ─── Doğrulama Modalı ───────────────────────────────────────────────────────

function ValidationModal({ modpack, loading, analysis, onClose, onRepair }) {
    const [selected, setSelected] = useState({});

    // Zorunlu (canSkip=false) sorunlar otomatik seçili, atlanamaz
    const allIssues = analysis?.issues || [];
    const toggleIssue = (id, canSkip) => {
        if (!canSkip) return;
        setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isSelected = (issue) => {
        if (!issue.canSkip) return true;
        return selected[issue.id] !== false; // varsayılan seçili
    };

    const selectedIds = allIssues.filter(i => isSelected(i)).map(i => i.id);

    const severityStyle = (severity) => {
        if (severity === 'error') return 'text-red-600 bg-red-50 border-red-200';
        if (severity === 'warning') return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-blue-600 bg-blue-50 border-blue-200';
    };

    const SeverityIcon = ({ severity }) => {
        if (severity === 'error') return <HiOutlineExclamationTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />;
        if (severity === 'warning') return <HiOutlineExclamationTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
        return <HiOutlineInformationCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="glass-card p-6 w-full max-w-xl max-h-[90vh] flex flex-col fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <HiOutlineWrenchScrewdriver className="w-5 h-5 text-gray-700" />
                        Doğrula & Onar — {modpack.name}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Analiz ediliyor...</p>
                    </div>
                ) : analysis ? (
                    <>
                        {/* Tespit Bilgisi */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-4 flex-shrink-0">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tespit Sonucu</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <span className="text-gray-500">Paket Tipi:</span>
                                <span className="font-medium text-gray-900 capitalize">{analysis.detectedInfo?.packageType || '?'}</span>
                                <span className="text-gray-500">Loader:</span>
                                <span className="font-medium text-gray-900 uppercase">{analysis.detectedInfo?.loader || '?'}</span>
                                <span className="text-gray-500">MC Sürümü:</span>
                                <span className="font-medium text-gray-900">{analysis.detectedInfo?.mcVersion || '?'}</span>
                                <span className="text-gray-500">Gerekli Java:</span>
                                <span className="font-medium text-gray-900">{analysis.detectedInfo?.requiredJava ? `Java ${analysis.detectedInfo.requiredJava}` : '?'}</span>
                            </div>
                        </div>

                        {/* Sorun Listesi */}
                        {allIssues.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-3 text-green-600">
                                <HiOutlineShieldCheck className="w-12 h-12" />
                                <p className="font-semibold">Sorun bulunamadı!</p>
                                <p className="text-sm text-gray-500">Sunucu başlatılmaya hazır.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500 mb-3 flex-shrink-0">
                                    {allIssues.length} sorun tespit edildi. Onarılacakları seçin:
                                </p>
                                <div className="flex-1 overflow-y-auto space-y-2 min-h-0 mb-4">
                                    {allIssues.map(issue => (
                                        <div
                                            key={issue.id}
                                            onClick={() => toggleIssue(issue.id, issue.canSkip)}
                                            className={`border rounded-xl p-3 transition-all ${issue.canSkip ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'} ${isSelected(issue) ? severityStyle(issue.severity) : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                                    {isSelected(issue)
                                                        ? <div className="w-4 h-4 rounded bg-current opacity-80 flex items-center justify-center">
                                                            <HiOutlineCheckCircle className="w-3 h-3 text-white" />
                                                          </div>
                                                        : <div className="w-4 h-4 rounded border-2 border-gray-300" />
                                                    }
                                                    <SeverityIcon severity={issue.severity} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-semibold">{issue.title}</p>
                                                        {!issue.canSkip && (
                                                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Zorunlu</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs opacity-80 mt-0.5">{issue.description}</p>
                                                    <p className="text-xs font-medium mt-1 opacity-70">→ {issue.action}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 justify-end flex-shrink-0">
                                    <button onClick={onClose} className="btn-secondary">İptal</button>
                                    <button
                                        onClick={() => onRepair(selectedIds)}
                                        disabled={selectedIds.length === 0}
                                        className="btn-primary"
                                    >
                                        <HiOutlineWrenchScrewdriver className="w-4 h-4" />
                                        {selectedIds.length} Sorunu Onar
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}

// ─── Onarım İlerleme Modalı ─────────────────────────────────────────────────

function RepairProgressModal({ status, modpackId, onClose }) {
    const [verifyResult, setVerifyResult] = useState(null);

    // Onarım bitince final doğrulama yap
    const handleVerify = async () => {
        try {
            const res = await api.get(`/modpacks/${modpackId}/verify`);
            setVerifyResult(res.data);
        } catch { /* ignore */ }
    };

    const isDone = status?.done;
    const hasError = !!status?.error;
    const log = status?.log || [];
    const progress = status?.progress || 0;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="glass-card p-6 w-full max-w-lg flex flex-col fade-in">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {isDone
                            ? hasError
                                ? <><HiOutlineExclamationTriangle className="w-5 h-5 text-red-500" /> Onarım Hatası</>
                                : <><HiOutlineShieldCheck className="w-5 h-5 text-green-500" /> Onarım Tamamlandı</>
                            : <><div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin flex-shrink-0" /> Onarım Devam Ediyor...</>
                        }
                    </h2>
                    {isDone && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                            <HiOutlineXMark className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${hasError ? 'bg-red-500' : 'bg-gray-900'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Log */}
                <div className="bg-gray-900 rounded-xl p-3 h-40 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5 mb-4">
                    {log.length === 0 ? (
                        <p className="text-gray-500">Başlatılıyor...</p>
                    ) : log.map((line, i) => (
                        <p key={i} className={line.startsWith('Hata') ? 'text-red-400' : ''}>{line}</p>
                    ))}
                </div>

                {/* Final doğrulama sonucu */}
                {isDone && !hasError && !verifyResult && (
                    <button onClick={handleVerify} className="btn-secondary w-full mb-3 flex items-center justify-center gap-2">
                        <HiOutlineShieldCheck className="w-4 h-4" /> Final Doğrulaması Yap
                    </button>
                )}

                {verifyResult && (
                    <div className={`rounded-xl p-3 mb-3 text-sm ${verifyResult.ready ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        <p className="font-semibold">{verifyResult.summary}</p>
                        {verifyResult.issues?.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs">
                                {verifyResult.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {isDone && (
                    <button onClick={onClose} className="btn-primary w-full">Kapat</button>
                )}
            </div>
        </div>
    );
}

const AIKARS_FLAGS = `-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1`;

const RAM_PRESETS = ['1G', '2G', '3G', '4G', '6G', '8G', '12G', '16G', '32G'];

const PROPS_GROUPS = [
    {
        label: 'Bağlantı & Erişim',
        keys: [
            { key: 'server-port', label: 'Sunucu Portu', type: 'number' },
            { key: 'server-ip', label: 'Sunucu IP', type: 'text' },
            { key: 'max-players', label: 'Maks. Oyuncu', type: 'number' },
            { key: 'online-mode', label: 'Online Mod (Premium)', type: 'boolean' },
            { key: 'white-list', label: 'Whitelist', type: 'boolean' },
            { key: 'enforce-whitelist', label: 'Whitelist Zorla', type: 'boolean' },
        ],
    },
    {
        label: 'Oyun Ayarları',
        keys: [
            { key: 'difficulty', label: 'Zorluk', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
            { key: 'gamemode', label: 'Oyun Modu', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
            { key: 'pvp', label: 'PvP', type: 'boolean' },
            { key: 'spawn-monsters', label: 'Canavar Doğması', type: 'boolean' },
            { key: 'spawn-animals', label: 'Hayvan Doğması', type: 'boolean' },
            { key: 'spawn-npcs', label: 'Köylü Doğması', type: 'boolean' },
            { key: 'allow-flight', label: 'Uçuşa İzin', type: 'boolean' },
            { key: 'allow-nether', label: 'Nether Boyutu', type: 'boolean' },
            { key: 'enable-command-block', label: 'Komut Bloğu', type: 'boolean' },
        ],
    },
    {
        label: 'Dünya',
        keys: [
            { key: 'level-name', label: 'Dünya Adı', type: 'text' },
            { key: 'level-seed', label: 'Seed', type: 'text' },
            { key: 'view-distance', label: 'Görüş Mesafesi', type: 'number' },
            { key: 'simulation-distance', label: 'Simülasyon Mesafesi', type: 'number' },
        ],
    },
    {
        label: 'Sunucu',
        keys: [
            { key: 'motd', label: 'Sunucu Mesajı (MOTD)', type: 'text' },
            { key: 'op-permission-level', label: 'Op Yetki Seviyesi', type: 'number' },
            { key: 'player-idle-timeout', label: 'Boşta Kalma Süresi (dk)', type: 'number' },
            { key: 'max-tick-time', label: 'Maks. Tick Süresi (ms)', type: 'number' },
        ],
    },
];

function ModpackSettingsModal({ modpack, onClose, onSave, saving }) {
    const [activeTab, setActiveTab] = useState('port');
    const [portError, setPortError] = useState('');
    const [settings, setSettings] = useState({
        server_port: modpack.server_port || 25565,
        minRam: modpack.min_ram || '2G',
        maxRam: modpack.max_ram || '4G',
        jvmArgs: modpack.jvm_args || '',
        properties: {},
    });

    // React Query v5: onSuccess kaldırıldı, useEffect kullan
    const { data: settingsData, isLoading } = useQuery({
        queryKey: ['modpackSettings', modpack.id],
        queryFn: () => api.get(`/modpacks/${modpack.id}/settings`).then(r => r.data),
        staleTime: 0,
    });

    useEffect(() => {
        if (!settingsData) return;
        setSettings(prev => ({
            ...prev,
            server_port: settingsData.server_port || prev.server_port,
            minRam: settingsData.minRam || prev.minRam,
            maxRam: settingsData.maxRam || prev.maxRam,
            jvmArgs: settingsData.jvmArgs || prev.jvmArgs,
            properties: settingsData.properties || {},
        }));
    }, [settingsData]);

    const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
    const setProp = (key, value) => setSettings(prev => ({ ...prev, properties: { ...prev.properties, [key]: value } }));

    const validatePort = (val) => {
        const n = parseInt(val);
        if (isNaN(n) || n < 1024 || n > 65535) {
            setPortError('Port 1024–65535 arasında olmalı');
            return false;
        }
        setPortError('');
        return true;
    };

    const handleSave = () => {
        if (!validatePort(settings.server_port)) return;
        onSave(settings);
    };

    const hasProperties = Object.keys(settings.properties || {}).length > 0;

    const TABS = [
        { id: 'port', label: 'Bağlantı' },
        { id: 'ram', label: 'Bellek' },
        { id: 'jvm', label: 'JVM' },
        { id: 'props', label: 'Oyun Ayarları' },
    ];

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col fade-in" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {modpack.logo_url
                                ? <img src={modpack.logo_url} alt="" className="w-full h-full object-cover" />
                                : <HiOutlineCog6Tooth className="w-5 h-5 text-gray-500" />
                            }
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 leading-tight">{modpack.name}</h2>
                            <p className="text-xs text-gray-400">{modpack.version}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-3 flex-shrink-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* ── Bağlantı ── */}
                            {activeTab === 'port' && (
                                <div className="space-y-5 fade-in">
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
                                        Farklı port kullanarak aynı makinede birden fazla sunucu eş zamanlı çalıştırabilirsiniz.
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Sunucu Portu</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                value={settings.server_port}
                                                onChange={e => { set('server_port', parseInt(e.target.value) || ''); validatePort(e.target.value); }}
                                                className={`input-field w-40 text-lg font-mono font-bold ${portError ? 'border-red-400' : ''}`}
                                                min={1024} max={65535}
                                            />
                                            <button
                                                onClick={() => { set('server_port', 25565); setPortError(''); }}
                                                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                                            >
                                                Varsayılana sıfırla (25565)
                                            </button>
                                        </div>
                                        {portError && <p className="text-xs text-red-500 mt-1">{portError}</p>}
                                        <p className="text-xs text-gray-400 mt-2">Geçerli aralık: 1024 – 65535</p>
                                    </div>

                                    {/* Hızlı port önerileri */}
                                    <div>
                                        <p className="text-xs font-medium text-gray-500 mb-2">Hızlı Seçim</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {[25565, 25566, 25567, 19132, 19133].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => { set('server_port', p); setPortError(''); }}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-all border ${settings.server_port === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Bellek ── */}
                            {activeTab === 'ram' && (
                                <div className="space-y-6 fade-in">
                                    {/* Max RAM */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-semibold text-gray-700">Maksimum RAM</label>
                                            <span className="text-lg font-bold font-mono text-gray-900">{settings.maxRam || '—'}</span>
                                        </div>
                                        <div className="flex gap-2 flex-wrap mb-2">
                                            {RAM_PRESETS.map(p => (
                                                <button key={p} onClick={() => set('maxRam', p)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium transition-all border ${settings.maxRam === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        <input type="text" value={settings.maxRam}
                                            onChange={e => set('maxRam', e.target.value)}
                                            className="input-field font-mono text-sm" placeholder="Özel: 6G, 10G, 24G..." />
                                    </div>

                                    {/* Min RAM */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-semibold text-gray-700">Minimum RAM</label>
                                            <span className="text-lg font-bold font-mono text-gray-900">{settings.minRam || '—'}</span>
                                        </div>
                                        <div className="flex gap-2 flex-wrap mb-2">
                                            {RAM_PRESETS.slice(0, 6).map(p => (
                                                <button key={p} onClick={() => set('minRam', p)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium transition-all border ${settings.minRam === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        <input type="text" value={settings.minRam}
                                            onChange={e => set('minRam', e.target.value)}
                                            className="input-field font-mono text-sm" placeholder="Özel: 1G, 2G..." />
                                    </div>

                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                                        <strong>Öneri:</strong> Max RAM = sistem RAM'inin %70-80'i. Min RAM = Max RAM'in yarısı.
                                        Örnek: 16GB sistem → Max: 12G, Min: 4G
                                    </div>
                                </div>
                            )}

                            {/* ── JVM ── */}
                            {activeTab === 'jvm' && (
                                <div className="space-y-4 fade-in">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-semibold text-gray-700">JVM Argümanları</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => set('jvmArgs', AIKARS_FLAGS)}
                                                className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium"
                                            >
                                                ✦ Aikar's Flags Ekle
                                            </button>
                                            <button
                                                onClick={() => set('jvmArgs', '')}
                                                className="text-xs px-3 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                                            >
                                                Temizle
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        value={settings.jvmArgs}
                                        onChange={e => set('jvmArgs', e.target.value)}
                                        className="input-field h-48 font-mono text-xs resize-none"
                                        placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled ..."
                                        spellCheck={false}
                                    />
                                    <p className="text-xs text-gray-400">
                                        Boş bırakılırsa varsayılan JVM ayarları kullanılır. Aikar's Flags Minecraft sunucuları için optimize edilmiş performans bayraklarıdır.
                                    </p>
                                    {settings.jvmArgs && (
                                        <div className="bg-gray-50 rounded-xl p-3">
                                            <p className="text-xs text-gray-500 font-medium mb-1">Önizleme:</p>
                                            <p className="text-xs font-mono text-gray-600 break-all">
                                                java -Xmx{settings.maxRam || '4G'} -Xms{settings.minRam || '2G'} {settings.jvmArgs} -jar server.jar nogui
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Oyun Ayarları ── */}
                            {activeTab === 'props' && (
                                <div className="fade-in">
                                    {!hasProperties ? (
                                        <div className="text-center py-12 text-gray-400 space-y-3">
                                            <HiOutlineCog6Tooth className="w-12 h-12 mx-auto opacity-20" />
                                            <p className="font-medium">server.properties bulunamadı</p>
                                            <p className="text-sm">Sunucuyu en az bir kez başlatın — Minecraft ilk açılışta bu dosyayı otomatik oluşturur.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {PROPS_GROUPS.map(group => {
                                                const groupProps = group.keys.filter(k => k.key in settings.properties);
                                                if (groupProps.length === 0) return null;
                                                return (
                                                    <div key={group.label}>
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{group.label}</p>
                                                        <div className="space-y-1">
                                                            {groupProps.map(({ key, label, type, options }) => {
                                                                const value = settings.properties[key] ?? '';
                                                                return (
                                                                    <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
                                                                        <label className="text-sm text-gray-700 flex-1">{label}
                                                                            <span className="ml-2 text-xs text-gray-300 font-mono">{key}</span>
                                                                        </label>
                                                                        <div className="flex-shrink-0">
                                                                            {type === 'boolean' ? (
                                                                                <button
                                                                                    onClick={() => setProp(key, value === 'true' ? 'false' : 'true')}
                                                                                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border min-w-[72px] ${value === 'true' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                                                                                >
                                                                                    {value === 'true' ? 'Açık' : 'Kapalı'}
                                                                                </button>
                                                                            ) : type === 'select' ? (
                                                                                <select value={value} onChange={e => setProp(key, e.target.value)}
                                                                                    className="input-field text-sm py-1.5 w-36">
                                                                                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                                </select>
                                                                            ) : (
                                                                                <input type={type === 'number' ? 'number' : 'text'} value={value}
                                                                                    onChange={e => setProp(key, e.target.value)}
                                                                                    className="input-field text-sm py-1.5 w-40 font-mono" />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Diğer properties (gruba girmeyenler) */}
                                            {(() => {
                                                const knownKeys = PROPS_GROUPS.flatMap(g => g.keys.map(k => k.key));
                                                const others = Object.entries(settings.properties).filter(([k]) => !knownKeys.includes(k));
                                                if (others.length === 0) return null;
                                                return (
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Diğer</p>
                                                        <div className="space-y-1">
                                                            {others.map(([key, value]) => (
                                                                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
                                                                    <label className="text-xs font-mono text-gray-500 flex-1">{key}</label>
                                                                    <input type="text" value={value}
                                                                        onChange={e => setProp(key, e.target.value)}
                                                                        className="input-field text-xs py-1.5 w-48 font-mono" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-gray-100 justify-end flex-shrink-0">
                    <button onClick={onClose} className="btn-secondary">İptal</button>
                    <button onClick={handleSave} disabled={saving || isLoading || !!portError} className="btn-primary">
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Kaydediliyor...</>
                            : 'Kaydet'
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
