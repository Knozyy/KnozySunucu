import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlinePuzzlePiece, HiOutlineTrash, HiOutlineCheck,
    HiOutlineXMark, HiOutlineMagnifyingGlass, HiOutlineArrowDownTray,
    HiOutlineDocumentText, HiOutlinePencil, HiOutlineCloudArrowUp,
    HiOutlineArrowPath, HiOutlineFire, HiOutlineCheckCircle,
} from 'react-icons/hi2';

function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

export default function ModsPage() {
    const [activeTab, setActiveTab] = useState('installed');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingConfig, setEditingConfig] = useState(null);
    const [configContent, setConfigContent] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [updateModal, setUpdateModal] = useState(null);
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['mods'],
        queryFn: () => api.get('/mods').then(r => r.data),
    });

    // Popüler modlar (arama sekmesi açıldığında otomatik)
    const { data: popularData, isFetching: loadingPopular } = useQuery({
        queryKey: ['modPopular'],
        queryFn: () => api.get('/mods/search').then(r => r.data),
        enabled: activeTab === 'search',
        staleTime: 300000,
    });

    const { data: searchData, isFetching: searching, refetch: doSearch } = useQuery({
        queryKey: ['modSearch', searchQuery],
        queryFn: () => api.get(`/mods/search?q=${encodeURIComponent(searchQuery)}`).then(r => r.data),
        enabled: false,
    });

    const { data: configsData } = useQuery({
        queryKey: ['configs'],
        queryFn: () => api.get('/mods/configs').then(r => r.data),
        enabled: activeTab === 'configs',
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

    const downloadMutation = useMutation({
        mutationFn: ({ modId, fileId, fileName }) => api.post('/mods/download', { modId, fileId, fileName }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['mods'] });
            queryClient.invalidateQueries({ queryKey: ['modSearch'] });
            queryClient.invalidateQueries({ queryKey: ['modPopular'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'İndirilemedi'),
    });

    const saveConfigMutation = useMutation({
        mutationFn: ({ path, content }) => api.put('/mods/configs/write', { path, content }),
        onSuccess: () => { toast.success('Config kaydedildi'); setEditingConfig(null); },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaydedilemedi'),
    });

    const uploadMutation = useMutation({
        mutationFn: (files) => {
            const formData = new FormData();
            for (const file of files) formData.append('mods', file);
            return api.post('/mods/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        },
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['mods'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const updateModMutation = useMutation({
        mutationFn: ({ oldFileName, modId, fileId, newFileName }) =>
            api.post('/mods/update', { oldFileName, modId, fileId, newFileName }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            setUpdateModal(null);
            queryClient.invalidateQueries({ queryKey: ['mods'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncelleme başarısız'),
    });

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        doSearch();
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.jar'));
        if (files.length === 0) { toast.error('Sadece .jar dosyaları yüklenebilir'); return; }
        uploadMutation.mutate(files);
    }, [uploadMutation]);

    const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleFileSelect = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.jar';
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) uploadMutation.mutate(files);
        };
        input.click();
    };

    const openConfig = async (file) => {
        try {
            const res = await api.get(`/mods/configs/read?path=${encodeURIComponent(file.path)}`);
            setEditingConfig(file);
            setConfigContent(res.data.content);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Dosya okunamadı');
        }
    };

    const openUpdateModal = async (modName) => {
        setUpdateModal({ modName, loading: true, mod: null, files: [] });
        try {
            const res = await api.get(`/mods/versions/${encodeURIComponent(modName)}`);
            if (!res.data.mod) {
                toast.error('CurseForge\'da eşleşen mod bulunamadı');
                setUpdateModal(null);
                return;
            }
            setUpdateModal({
                modName,
                loading: false,
                mod: res.data.mod,
                files: res.data.files,
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sürümler alınamadı');
            setUpdateModal(null);
        }
    };

    const handleUpdateMod = (file) => {
        if (!updateModal) return;
        updateModMutation.mutate({
            oldFileName: updateModal.modName,
            modId: updateModal.mod.id,
            fileId: file.id,
            newFileName: file.fileName,
        });
    };

    // Arama sekmesinde gösterilecek mod: arama yapılmışsa arama, yapılmamışsa popüler
    const modsToShow = searchData?.mods || (searchQuery ? [] : popularData?.mods) || [];

    const mods = data?.mods || [];
    const count = data?.count || { active: 0, disabled: 0, total: 0 };

    const tabs = [
        { id: 'installed', label: `Yüklü (${count.total})` },
        { id: 'search', label: 'Ara & İndir' },
        { id: 'configs', label: 'Config Editörü' },
    ];

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('mods.title')}</h1>
                <p className="text-gray-500">{count.active} aktif, {count.disabled} devre dışı — toplam {count.total} mod</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 fade-in">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                    >{tab.label}</button>
                ))}
            </div>

            {/* Search Tab */}
            {activeTab === 'search' && (
                <>
                    <form onSubmit={handleSearch} className="fade-in">
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="input-field pl-12" placeholder="Mod adı ara... (örn: JEI, Optifine, Mekanism)" />
                            </div>
                            <button type="submit" disabled={searching || !searchQuery.trim()} className="btn-primary">
                                {searching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Ara'}
                            </button>
                        </div>
                    </form>

                    {/* Başlık */}
                    {!searchData && !searchQuery && (
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 fade-in">
                            <HiOutlineFire className="w-5 h-5 text-amber-500" />
                            Popüler Modlar
                        </h3>
                    )}

                    {(loadingPopular || searching) ? (
                        <div className="glass-card p-8 text-center text-gray-400">
                            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            Yükleniyor...
                        </div>
                    ) : modsToShow.length > 0 ? (
                        <div className="glass-card overflow-hidden fade-in">
                            {modsToShow.map(mod => (
                                <div key={mod.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                                    {mod.logo && <img src={mod.logo} alt={mod.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                                            {mod.name}
                                            {mod.isInstalled && (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                                    <HiOutlineCheckCircle className="w-3 h-3" /> Yüklü
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{mod.summary}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-gray-400">{(mod.downloadCount / 1000000).toFixed(1)}M indirme</span>
                                            {mod.latestFile?.gameVersions?.slice(0, 3).map(v => (
                                                <span key={v} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">{v}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {mod.isInstalled ? (
                                        <button
                                            onClick={() => openUpdateModal(mod.latestFile?.fileName || mod.name)}
                                            className="btn-secondary text-xs"
                                        >
                                            <HiOutlineArrowPath className="w-4 h-4" />
                                            Sürüm Değiştir
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => downloadMutation.mutate({ modId: mod.id, fileId: mod.latestFile?.id, fileName: mod.latestFile?.fileName })}
                                            disabled={!mod.latestFile || downloadMutation.isPending}
                                            className="btn-primary text-xs"
                                        >
                                            <HiOutlineArrowDownTray className="w-4 h-4" />
                                            {downloadMutation.isPending ? 'İndiriliyor...' : 'İndir'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : searchData?.mods?.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">Sonuç bulunamadı</div>
                    ) : null}
                </>
            )}

            {/* Installed Mods */}
            {activeTab === 'installed' && (
                <>
                    {/* Drag & Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={handleFileSelect}
                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all fade-in ${isDragging
                            ? 'border-gray-900 bg-gray-50 dark:bg-gray-800 scale-[1.02]'
                            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                            }`}
                    >
                        {uploadMutation.isPending ? (
                            <div className="flex items-center justify-center gap-3">
                                <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm font-medium text-gray-700">Yükleniyor...</span>
                            </div>
                        ) : (
                            <>
                                <HiOutlineCloudArrowUp className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragging ? 'text-gray-900' : 'text-gray-300'}`} />
                                <p className="text-sm font-medium text-gray-600">
                                    {isDragging ? 'Bırakarak yükle!' : '.jar dosyalarını sürükle & bırak veya tıkla'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">Birden fazla mod aynı anda yüklenebilir (max 200MB)</p>
                            </>
                        )}
                    </div>

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
                                >
                                    {mod.enabled ? <HiOutlineCheck className="w-4 h-4" /> : <HiOutlineXMark className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => openUpdateModal(mod.name)}
                                    title="Sürüm Güncelle"
                                    className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-all p-2 rounded-lg hover:bg-blue-50"
                                >
                                    <HiOutlineArrowPath className="w-4 h-4" />
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
                </>
            )}

            {/* Config Editor */}
            {activeTab === 'configs' && (
                <>
                    {editingConfig ? (
                        <div className="glass-card p-4 fade-in">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <HiOutlinePencil className="w-4 h-4" /> {editingConfig.path}
                                </h3>
                                <div className="flex gap-2">
                                    <button onClick={() => saveConfigMutation.mutate({ path: editingConfig.path, content: configContent })}
                                        disabled={saveConfigMutation.isPending} className="btn-primary text-xs">
                                        {saveConfigMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                                    </button>
                                    <button onClick={() => setEditingConfig(null)} className="btn-secondary text-xs">Kapat</button>
                                </div>
                            </div>
                            <textarea
                                value={configContent} onChange={e => setConfigContent(e.target.value)}
                                className="w-full h-96 font-mono text-sm p-4 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                                spellCheck={false}
                            />
                        </div>
                    ) : (
                        <div className="glass-card overflow-hidden fade-in">
                            {configsData?.files?.length > 0 ? configsData.files.map(file => (
                                <button key={file.path} onClick={() => openConfig(file)}
                                    className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <HiOutlineDocumentText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                    <span className="text-sm text-gray-900 flex-1 truncate">{file.path}</span>
                                    <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
                                </button>
                            )) : (
                                <div className="p-8 text-center text-gray-400">
                                    <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>config/ klasöründe düzenlenebilir dosya bulunamadı</p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Sürüm Güncelleme Modalı */}
            {updateModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setUpdateModal(null)}>
                    <div className="glass-card p-6 w-full max-w-lg max-h-[80vh] flex flex-col fade-in" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <HiOutlineArrowPath className="w-5 h-5 text-blue-600" />
                                Sürüm Güncelle
                            </h2>
                            <button onClick={() => setUpdateModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                                <HiOutlineXMark className="w-5 h-5" />
                            </button>
                        </div>

                        {updateModal.loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                                <span className="ml-3 text-sm text-gray-600">CurseForge'dan sürümler aranıyor...</span>
                            </div>
                        ) : (
                            <>
                                {updateModal.mod && (
                                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                                        {updateModal.mod.logo && (
                                            <img src={updateModal.mod.logo} alt={updateModal.mod.name} className="w-10 h-10 rounded-lg object-cover" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{updateModal.mod.name}</p>
                                            <p className="text-xs text-gray-500 truncate">{updateModal.mod.summary}</p>
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs text-gray-500 mb-2">
                                    Mevcut dosya: <span className="font-mono text-gray-700">{updateModal.modName}</span>
                                </p>

                                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                                    {updateModal.files.length > 0 ? updateModal.files.map(file => (
                                        <div key={file.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{file.displayName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-400">{formatSize(file.fileLength)}</span>
                                                    <span className="text-xs text-gray-400">{formatDate(file.fileDate)}</span>
                                                    {file.gameVersions?.slice(0, 2).map(v => (
                                                        <span key={v} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">{v}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleUpdateMod(file)}
                                                disabled={updateModMutation.isPending}
                                                className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                                            >
                                                {updateModMutation.isPending ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <HiOutlineArrowDownTray className="w-3.5 h-3.5" />
                                                        Güncelle
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )) : (
                                        <div className="text-center py-8 text-gray-400">
                                            <p>Kullanılabilir sürüm bulunamadı</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
