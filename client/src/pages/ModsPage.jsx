import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap, Pill } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

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

// ── İkon yardımcıları ─────────────────────────────────────────────────────────

function PuzzleIcon({ size = 16, color }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color || 'currentColor'} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 7.5h-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h2.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-11a2 2 0 0 0-2-2z"/>
        </svg>
    );
}

function RefreshIcon({ size = 14, spinning }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={spinning ? { animation: 'hodo-spin 0.8s linear infinite' } : undefined}>
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
    );
}

function DocTextIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
    );
}

function FireIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
    );
}

function Spinner({ size = 16 }) {
    return (
        <div style={{
            width: size, height: size,
            border: `2px solid ${A.border}`,
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'hodo-spin 0.8s linear infinite',
        }}/>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ModsPage() {
    const [activeTab, setActiveTab]       = useState('installed');
    const [searchQuery, setSearchQuery]   = useState('');
    const [editingConfig, setEditingConfig] = useState(null);
    const [configContent, setConfigContent] = useState('');
    const [isDragging, setIsDragging]     = useState(false);
    const [updateModal, setUpdateModal]   = useState(null);
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data, isLoading } = useQuery({
        queryKey: ['mods'],
        queryFn: () => api.get('/mods').then(r => r.data),
    });

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

    const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleFileSelect = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true; input.accept = '.jar';
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
            setUpdateModal({ modName, loading: false, mod: res.data.mod, files: res.data.files });
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

    const modsToShow = searchData?.mods || (searchQuery ? [] : popularData?.mods) || [];
    const mods = data?.mods || [];
    const count = data?.count || { active: 0, disabled: 0, total: 0 };

    const tabs = [
        { id: 'installed', label: `Yüklü (${count.total})` },
        { id: 'search',    label: 'Ara & İndir' },
        { id: 'configs',   label: 'Config Editörü' },
    ];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Başlık ── */}
            <div>
                <Cap>modlar</Cap>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                    margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                    {t('mods.title')}
                </h1>
                <p style={{ fontSize: 12, color: A.dim, margin: 0, fontFamily: A.mono }}>
                    {count.active} aktif, {count.disabled} devre dışı — toplam {count.total} mod
                </p>
            </div>

            {/* ── Sekmeler ── */}
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${A.border}` }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        padding: '7px 14px', fontSize: 11, fontFamily: A.mono,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === tab.id ? A.text : A.dim,
                        borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                        marginBottom: -1, transition: 'color 0.15s',
                    }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Ara & İndir ── */}
            {activeTab === 'search' && (
                <>
                    <form onSubmit={handleSearch}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: 10, top: '50%',
                                    transform: 'translateY(-50%)', color: A.faint, display: 'flex',
                                }}>
                                    <I.Search size={13}/>
                                </span>
                                <input
                                    type="text" value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Mod adı ara... (örn: JEI, Optifine, Mekanism)"
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        paddingLeft: 30, paddingRight: 12,
                                        paddingTop: 8, paddingBottom: 8,
                                        background: A.panel, border: `1px solid ${A.border}`,
                                        borderRadius: 3, color: A.text, fontSize: 12,
                                        fontFamily: A.mono, outline: 'none',
                                    }}
                                />
                            </div>
                            <button type="submit" disabled={searching || !searchQuery.trim()} style={{
                                ...btnPrimary, padding: '0 16px', fontSize: 11,
                                display: 'flex', alignItems: 'center', gap: 6,
                                opacity: (searching || !searchQuery.trim()) ? 0.5 : 1,
                                cursor: (searching || !searchQuery.trim()) ? 'not-allowed' : 'pointer',
                            }}>
                                {searching ? <Spinner size={12}/> : 'ARA'}
                            </button>
                        </div>
                    </form>

                    {!searchData && !searchQuery && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FireIcon size={14} style={{ color: A.warn }}/>
                            <span style={{ fontSize: 13, fontWeight: 600, color: A.text }}>Popüler Modlar</span>
                        </div>
                    )}

                    {(loadingPopular || searching) ? (
                        <div style={{ background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '40px 20px', textAlign: 'center' }}>
                            <Spinner size={20} style={{ margin: '0 auto 10px' }}/>
                            <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>Yükleniyor...</p>
                        </div>
                    ) : modsToShow.length > 0 ? (
                        <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                            {modsToShow.map((mod, i) => (
                                <div key={mod.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px',
                                    borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                }}>
                                    {mod.logo && (
                                        <img src={mod.logo} alt={mod.name}
                                            style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}/>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: A.text,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {mod.name}
                                            </span>
                                            {mod.isInstalled && (
                                                <Pill style={{
                                                    background: 'rgba(74,222,128,0.1)', color: A.ok,
                                                    border: '1px solid rgba(74,222,128,0.2)', fontFamily: A.mono,
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                }}>
                                                    <I.Check size={10}/> Yüklü
                                                </Pill>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: A.faint,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            marginBottom: 4 }}>
                                            {mod.summary}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                                {(mod.downloadCount / 1000000).toFixed(1)}M indirme
                                            </span>
                                            {mod.latestFile?.gameVersions?.slice(0, 3).map(v => (
                                                <span key={v} style={{
                                                    fontSize: 9, fontFamily: A.mono, color: A.dim,
                                                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                                                    padding: '1px 5px', borderRadius: 2,
                                                }}>{v}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {mod.isInstalled ? (
                                        <button onClick={() => openUpdateModal(mod.latestFile?.fileName || mod.name)}
                                            style={{
                                                ...btnGhost, padding: '6px 12px', fontSize: 11, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', gap: 6,
                                            }}>
                                            <RefreshIcon size={12}/> Sürüm Değiştir
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => downloadMutation.mutate({
                                                modId: mod.id,
                                                fileId: mod.latestFile?.id,
                                                fileName: mod.latestFile?.fileName,
                                            })}
                                            disabled={!mod.latestFile || downloadMutation.isPending}
                                            style={{
                                                ...btnPrimary, padding: '6px 12px', fontSize: 11, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                opacity: (!mod.latestFile || downloadMutation.isPending) ? 0.5 : 1,
                                                cursor: (!mod.latestFile || downloadMutation.isPending) ? 'not-allowed' : 'pointer',
                                            }}>
                                            <I.Download size={12}/>
                                            {downloadMutation.isPending ? 'İndiriliyor...' : 'İndir'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : searchData?.mods?.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: A.faint, fontSize: 12 }}>
                            Sonuç bulunamadı
                        </div>
                    ) : null}
                </>
            )}

            {/* ── Yüklü Modlar ── */}
            {activeTab === 'installed' && (
                <>
                    {/* Drag & Drop Yükleme Alanı */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={handleFileSelect}
                        style={{
                            border: `2px dashed ${isDragging ? 'var(--accent)' : A.border}`,
                            borderRadius: 4, padding: '28px 20px', textAlign: 'center',
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: isDragging ? 'rgba(167,139,250,0.04)' : 'transparent',
                        }}>
                        {uploadMutation.isPending ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                <Spinner size={16}/>
                                <span style={{ fontSize: 12, color: A.dim, fontFamily: A.mono }}>Yükleniyor...</span>
                            </div>
                        ) : (
                            <>
                                <I.Upload size={28} style={{
                                    color: isDragging ? 'var(--accent)' : A.faint,
                                    margin: '0 auto 10px', display: 'block',
                                    transition: 'color 0.15s',
                                }}/>
                                <p style={{ fontSize: 12, color: isDragging ? A.text : A.dim, margin: '0 0 4px' }}>
                                    {isDragging ? 'Bırakarak yükle!' : '.jar dosyalarını sürükle & bırak veya tıkla'}
                                </p>
                                <p style={{ fontSize: 10, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                    Birden fazla mod aynı anda yüklenebilir (max 200MB)
                                </p>
                            </>
                        )}
                    </div>

                    {/* Mod listesi */}
                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        {isLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                                <Spinner size={20}/>
                            </div>
                        ) : mods.length > 0 ? mods.map((mod, i) => (
                            <div key={mod.name} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '9px 16px',
                                borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                            }}>
                                <div style={{
                                    width: 30, height: 30, borderRadius: 4, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: mod.enabled ? 'rgba(74,222,128,0.08)' : A.bgDeeper,
                                    border: `1px solid ${mod.enabled ? 'rgba(74,222,128,0.15)' : A.border}`,
                                    color: mod.enabled ? A.ok : A.faint,
                                }}>
                                    <PuzzleIcon size={14} color={mod.enabled ? A.ok : A.faint}/>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 12, fontWeight: 500, color: mod.enabled ? A.text : A.faint,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        textDecoration: mod.enabled ? 'none' : 'line-through',
                                    }}>
                                        {mod.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 1 }}>
                                        {formatSize(mod.size)}
                                    </div>
                                </div>
                                {/* Toggle */}
                                <button onClick={() => toggleMutation.mutate({ name: mod.name, enabled: mod.enabled })} style={{
                                    padding: '4px 8px', borderRadius: 3, fontSize: 10, fontFamily: A.mono,
                                    background: mod.enabled ? 'rgba(74,222,128,0.1)' : A.bgDeeper,
                                    border: `1px solid ${mod.enabled ? 'rgba(74,222,128,0.2)' : A.border}`,
                                    color: mod.enabled ? A.ok : A.faint,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                                }}>
                                    {mod.enabled ? <><I.Check size={10}/> Aktif</> : <><I.X size={10}/> Devre Dışı</>}
                                </button>
                                {/* Güncelle */}
                                <button onClick={() => openUpdateModal(mod.name)} title="Sürüm Değiştir" style={{
                                    ...btnGhost, padding: '4px 6px', color: A.faint,
                                    display: 'flex', alignItems: 'center', flexShrink: 0,
                                }}>
                                    <RefreshIcon size={13}/>
                                </button>
                                {/* Sil */}
                                <button
                                    onClick={() => { if (confirm(`${mod.name} kalıcı olarak silinecek. Emin misiniz?`)) deleteMutation.mutate(mod.name); }}
                                    style={{
                                        ...btnGhost, padding: '4px 6px', color: A.err,
                                        borderColor: 'rgba(248,113,113,0.2)',
                                        display: 'flex', alignItems: 'center', flexShrink: 0,
                                    }}>
                                    <I.Trash size={13}/>
                                </button>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                                <PuzzleIcon size={32} color={A.faint} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }}/>
                                <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>mods/ klasöründe mod bulunamadı</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Config Editörü ── */}
            {activeTab === 'configs' && (
                editingConfig ? (
                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 16px', borderBottom: `1px solid ${A.border}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <DocTextIcon size={13} style={{ color: A.faint }}/>
                                <span style={{ fontSize: 12, fontFamily: A.mono, color: A.dim }}>{editingConfig.path}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => saveConfigMutation.mutate({ path: editingConfig.path, content: configContent })}
                                    disabled={saveConfigMutation.isPending}
                                    style={{
                                        ...btnPrimary, padding: '5px 12px', fontSize: 11,
                                        opacity: saveConfigMutation.isPending ? 0.6 : 1,
                                    }}>
                                    {saveConfigMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                                <button onClick={() => setEditingConfig(null)} style={{ ...btnGhost, padding: '5px 12px', fontSize: 11 }}>
                                    Kapat
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={configContent}
                            onChange={e => setConfigContent(e.target.value)}
                            spellCheck={false}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                height: 400, padding: '16px',
                                background: A.bg, color: A.text,
                                fontFamily: A.mono, fontSize: 12, lineHeight: 1.6,
                                border: 'none', outline: 'none', resize: 'vertical',
                                display: 'block',
                            }}
                        />
                    </div>
                ) : (
                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        {configsData?.files?.length > 0 ? configsData.files.map((file, i) => (
                            <button key={file.path} onClick={() => openConfig(file)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                                background: 'none', border: 'none',
                                borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = A.bgDeeper}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                <DocTextIcon size={15} style={{ color: A.faint, flexShrink: 0 }}/>
                                <span style={{ flex: 1, fontSize: 12, color: A.text, fontFamily: A.mono,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.path}
                                </span>
                                <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, flexShrink: 0 }}>
                                    {formatSize(file.size)}
                                </span>
                            </button>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                                <DocTextIcon size={32} style={{ color: A.faint, margin: '0 auto 10px', display: 'block', opacity: 0.3 }}/>
                                <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>
                                    config/ klasöründe düzenlenebilir dosya bulunamadı
                                </p>
                            </div>
                        )}
                    </div>
                )
            )}

            {/* ── Sürüm Güncelleme Modalı ── */}
            {updateModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 16,
                }}>
                    <div onClick={() => setUpdateModal(null)} style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    }}/>
                    <div onClick={e => e.stopPropagation()} style={{
                        position: 'relative', zIndex: 1,
                        width: '100%', maxWidth: 520,
                        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                        background: A.panel, border: `1px solid ${A.border}`,
                        borderRadius: 4, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                        overflow: 'hidden',
                    }}>
                        {/* Modal başlık */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                            flexShrink: 0,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <RefreshIcon size={14} style={{ color: '#60a5fa' }}/>
                                <span style={{ fontSize: 14, fontWeight: 600, color: A.text }}>Sürüm Güncelle</span>
                            </div>
                            <button onClick={() => setUpdateModal(null)} style={{
                                ...btnGhost, padding: '4px 5px', color: A.faint,
                                display: 'flex', alignItems: 'center',
                            }}>
                                <I.X size={14}/>
                            </button>
                        </div>

                        {updateModal.loading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 12, padding: '48px 20px' }}>
                                <Spinner size={18}/>
                                <span style={{ fontSize: 12, color: A.dim, fontFamily: A.mono }}>
                                    CurseForge'dan sürümler aranıyor...
                                </span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                {/* Mod bilgisi */}
                                {updateModal.mod && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                                        flexShrink: 0,
                                    }}>
                                        {updateModal.mod.logo && (
                                            <img src={updateModal.mod.logo} alt={updateModal.mod.name}
                                                style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}/>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: A.text,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {updateModal.mod.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: A.faint,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                marginTop: 1 }}>
                                                {updateModal.mod.summary}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${A.border}`, flexShrink: 0 }}>
                                    <span style={{ fontSize: 11, color: A.faint }}>
                                        Mevcut dosya:{' '}
                                        <span style={{ fontFamily: A.mono, color: A.dim }}>{updateModal.modName}</span>
                                    </span>
                                </div>
                                {/* Sürüm listesi */}
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {updateModal.files.length > 0 ? updateModal.files.map((file, i) => (
                                        <div key={file.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 16px',
                                            borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: A.text,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {file.displayName}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                                    <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                                        {formatSize(file.fileLength)}
                                                    </span>
                                                    <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                                        {formatDate(file.fileDate)}
                                                    </span>
                                                    {file.gameVersions?.slice(0, 2).map(v => (
                                                        <span key={v} style={{
                                                            fontSize: 9, fontFamily: A.mono, color: A.dim,
                                                            background: A.bgDeeper, border: `1px solid ${A.border}`,
                                                            padding: '1px 5px', borderRadius: 2,
                                                        }}>{v}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={() => handleUpdateMod(file)}
                                                disabled={updateModMutation.isPending} style={{
                                                    ...btnPrimary, padding: '5px 12px', fontSize: 11, flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', gap: 5,
                                                    opacity: updateModMutation.isPending ? 0.6 : 1,
                                                    cursor: updateModMutation.isPending ? 'not-allowed' : 'pointer',
                                                }}>
                                                {updateModMutation.isPending
                                                    ? <Spinner size={12}/>
                                                    : <><I.Download size={11}/> Güncelle</>
                                                }
                                            </button>
                                        </div>
                                    )) : (
                                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                            <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>
                                                Kullanılabilir sürüm bulunamadı
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
