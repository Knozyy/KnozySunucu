import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatNumber, formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Dot, Pill } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Ortak form yardımcıları (elle modpack modalları)
const inputStyle = {
    background: A.bg, border: `1px solid ${A.border}`,
    color: A.text, fontFamily: A.sans, fontSize: 13,
    padding: '9px 10px', borderRadius: 2, width: '100%', outline: 'none',
};
function fieldLabel(text) {
    return <div style={{ fontSize: 13, fontWeight: 500, color: A.text, marginBottom: 4 }}>{text}</div>;
}

function formatFileDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

// ── HooDoo modal kabuk bileşeni ───────────────────────────────────────────
function Modal({ children, onClose, maxWidth = 560 }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: 16,
        }} onClick={onClose}>
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`,
                borderRadius: 4, width: '100%', maxWidth,
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

function ModalHeader({ title, onClose }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${A.border}`, flexShrink: 0,
        }}>
            <Cap style={{ fontSize: 11 }}>{title}</Cap>
            <button onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                <I.X size={16}/>
            </button>
        </div>
    );
}

// ── Spinner yardımcı bileşeni ─────────────────────────────────────────────
function Spinner({ size = 14, color = 'var(--accent)' }) {
    return (
        <>
            <div style={{
                width: size, height: size,
                border: `2px solid ${A.border}`, borderTopColor: color,
                borderRadius: 99, animation: 'hoodoo-spin 0.8s linear infinite',
            }}/>
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}

export default function ModpacksPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('search');
    const [provider, setProvider] = useState('curseforge');
    const [editingModpack, setEditingModpack] = useState(null);
    const [confirmSwitch, setConfirmSwitch] = useState(null);
    const [versionModal, setVersionModal] = useState(null);
    const [updateVersionModal, setUpdateVersionModal] = useState(null);
    const [validationModal, setValidationModal] = useState(null);
    const [repairModal, setRepairModal] = useState(null);
    const [repairPolling, setRepairPolling] = useState(false);
    const [terminalHint, setTerminalHint] = useState(null);
    const [createManualOpen, setCreateManualOpen] = useState(false);
    const [manualPackModal, setManualPackModal] = useState(null); // yönetilen elle paket
    const queryClient = useQueryClient();
    const navigate = useNavigate();

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
            toast.success('Ayarlar güncellendi');
            setEditingModpack(null);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncelleme başarısız'),
    });

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

    useEffect(() => {
        if (
            installStatusData?.progress === 100 &&
            !installStatusData?.isInstalling &&
            !installStatusData?.error &&
            provider === 'ftb' &&
            installStatusData?.installPath
        ) {
            setTerminalHint({
                installPath: installStatusData.installPath,
                name: installStatusData.modpackName || 'FTB Modpack',
            });
        }
    }, [installStatusData, provider]);

    const openTerminalForInstall = (installPath) => {
        const cmd = `cd "${installPath}" && ls -la`;
        navigate(`/terminal?run=${encodeURIComponent(cmd)}`);
    };

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

    const openUpdateVersionModal = async (modpack) => {
        if (!modpack.curseforge_id) { toast.error('Kayıt ID bulunamadı'); return; }
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
        updateModpackMutation.mutate({ dbId: modpack.id, modId: modpack.curseforge_id, fileId });
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
        if (activeProfileData?.serverStatus === 'running') setConfirmSwitch(modpack);
        else activateMutation.mutate(modpack.id);
    };

    const createManualMutation = useMutation({
        mutationFn: (name) => api.post('/modpacks/manual', { name }).then(r => r.data),
        onSuccess: (data) => {
            toast.success(data.message || 'Profil oluşturuldu');
            setCreateManualOpen(false);
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            // Oluşturulan profili hemen dosya yönetimi modalında aç
            setManualPackModal({ id: data.id, name: data.name });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Profil oluşturulamadı'),
    });

    const checkUpdatesMutation = useMutation({
        mutationFn: () => api.post('/modpacks/check-updates').then(r => r.data),
        onSuccess: (data) => {
            if (data.found?.length > 0) {
                toast.success(`${data.found.length} pakette güncelleme var: ${data.found.map(f => f.name).join(', ')}`);
            } else {
                toast.success('Tüm paketler güncel');
            }
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncelleme kontrolü başarısız'),
    });

    const modpacksToShow = activeTab === 'search'
        ? (searchResults?.modpacks || popularData?.modpacks || [])
        : (installedData?.modpacks || []);

    const isInstalling = installMutation.isPending || installStatusData?.isInstalling;
    const installProgress = installStatusData?.progress || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <I.Cube size={16} style={{ color: 'var(--accent)' }}/>
                <Cap style={{ fontSize: 11 }}>Modpackler</Cap>
                {activeProfileData?.profile && (
                    <Pill color={A.ok} bg="rgba(74,222,128,0.1)">
                        <Dot color={A.ok} size={5}/>
                        {activeProfileData.profile.name}
                    </Pill>
                )}
            </div>

            {/* ── Aktif profil banner ── */}
            {activeProfileData?.profile && (
                <div style={{
                    background: 'rgba(74,222,128,0.06)',
                    border: `1px solid rgba(74,222,128,0.2)`,
                    borderRadius: 4, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <I.Check size={14} style={{ color: A.ok, flexShrink: 0 }}/>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, color: A.text }}>
                            Aktif Profil:&nbsp;
                            <span style={{ color: A.ok, fontWeight: 600 }}>{activeProfileData.profile.name}</span>
                            {activeProfileData.profile.server_port && activeProfileData.profile.server_port !== 25565 && (
                                <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, marginLeft: 8 }}>
                                    port:{activeProfileData.profile.server_port}
                                </span>
                            )}
                        </span>
                        <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, marginTop: 2 }}>
                            {activeProfileData.profile.install_path}
                        </div>
                    </div>
                    <Pill
                        color={activeProfileData.serverStatus === 'running' ? A.ok : A.faint}
                        bg={activeProfileData.serverStatus === 'running' ? 'rgba(74,222,128,0.1)' : 'transparent'}>
                        {activeProfileData.serverStatus === 'running' ? 'ÇALIŞIYOR' : 'KAPALI'}
                    </Pill>
                </div>
            )}

            {/* ── Sekmeler + sağ butonlar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {[
                    { id: 'search', label: 'Ara & Yükle', icon: I.Search },
                    { id: 'installed', label: `Profiller (${installedData?.modpacks?.length || 0})`, icon: I.Cube },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', border: 'none', cursor: 'pointer',
                            fontFamily: A.sans, fontSize: 12, borderRadius: 2,
                            background: activeTab === tab.id ? A.panel : 'transparent',
                            color: activeTab === tab.id ? A.text : A.dim,
                            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                        }}>
                        <tab.icon size={13}/> {tab.label}
                    </button>
                ))}

                {activeTab === 'search' && (
                    <div style={{
                        marginLeft: 'auto', display: 'flex',
                        background: A.panel, border: `1px solid ${A.border}`,
                        borderRadius: 2, overflow: 'hidden',
                    }}>
                        {['curseforge', 'ftb'].map(p => (
                            <button key={p} onClick={() => setProvider(p)}
                                style={{
                                    padding: '5px 12px', border: 'none', cursor: 'pointer',
                                    fontFamily: A.mono, fontSize: 10, letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                    background: provider === p ? 'rgba(167,139,250,0.12)' : 'transparent',
                                    color: provider === p ? 'var(--accent)' : A.faint,
                                }}>
                                {p === 'ftb' ? 'Feed The Beast' : 'CurseForge'}
                            </button>
                        ))}
                    </div>
                )}
                {activeTab === 'installed' && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => setCreateManualOpen(true)}
                            style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                            <I.Plus size={11}/> ELLE OLUŞTUR
                        </button>
                        <button onClick={() => checkUpdatesMutation.mutate()} disabled={checkUpdatesMutation.isPending}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                            {checkUpdatesMutation.isPending ? <Spinner size={11}/> : <I.Download size={11}/>} GÜNCELLEME DENETLE
                        </button>
                        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] })}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                            <I.Restart size={11}/> YENİLE
                        </button>
                    </div>
                )}
            </div>

            {/* ── Arama çubuğu ── */}
            {activeTab === 'search' && (
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <I.Search size={13} style={{
                            position: 'absolute', left: 10, top: '50%',
                            transform: 'translateY(-50%)', color: A.faint,
                        }}/>
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Modpack adı ara... (örn: RLCraft, All the Mods)"
                            style={{
                                background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.sans, fontSize: 13,
                                padding: '9px 10px 9px 32px', borderRadius: 2,
                                width: '100%', outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                            onBlur={e => e.target.style.borderColor = A.border}
                        />
                    </div>
                    <button type="submit" disabled={searching || !searchQuery.trim()}
                        style={{
                            ...btnPrimary, display: 'flex', alignItems: 'center',
                            gap: 6, padding: '9px 18px', fontSize: 12,
                            opacity: (!searchQuery.trim()) ? 0.5 : 1,
                            cursor: (!searchQuery.trim()) ? 'not-allowed' : 'pointer',
                        }}>
                        {searching ? <Spinner size={12}/> : <><I.Search size={12}/> ARA</>}
                    </button>
                </form>
            )}

            {/* ── Kurulum ilerleme çubuğu ── */}
            {(isInstalling || (installProgress > 0 && installProgress < 100)) && (
                <div style={{
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderLeft: `3px solid var(--accent)`,
                    borderRadius: 4, padding: '12px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <Spinner size={14}/>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: A.text }}>{installStatusData?.task || 'Kurulum'}</div>
                            <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, marginTop: 2 }}>
                                {installStatusData?.status || 'İşleniyor...'}
                            </div>
                        </div>
                        <span style={{ fontFamily: A.mono, fontSize: 14, color: 'var(--accent)' }}>
                            {installProgress}%
                        </span>
                    </div>
                    <div style={{ background: A.bg, border: `1px solid ${A.border}`, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', background: 'var(--accent)',
                            width: `${installProgress}%`,
                            transition: 'width 0.5s ease', borderRadius: 2,
                        }}/>
                    </div>
                    {/* Canlı kurulum logu — hangi adımda olduğu satır satır görünür */}
                    {installStatusData?.log?.length > 0 && (
                        <div style={{
                            marginTop: 10, background: A.bg, border: `1px solid ${A.border}`,
                            borderRadius: 2, padding: '8px 10px', maxHeight: 150, overflowY: 'auto',
                            display: 'flex', flexDirection: 'column-reverse',
                        }}>
                            <div>
                                {installStatusData.log.slice(-40).map((line, i) => (
                                    <div key={i} style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {line}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {installProgress === 100 && !installStatusData?.isInstalling && !installStatusData?.error && (
                <div style={{
                    background: 'rgba(74,222,128,0.06)', border: `1px solid rgba(74,222,128,0.2)`,
                    borderLeft: `3px solid ${A.ok}`, borderRadius: 4, padding: '10px 14px',
                    fontFamily: A.mono, fontSize: 11, color: A.ok,
                }}>
                    ✓ {installStatusData?.status || 'Kurulum tamamlandı!'}
                </div>
            )}

            {installStatusData?.error && (
                <div style={{
                    background: 'rgba(248,113,113,0.06)', border: `1px solid rgba(248,113,113,0.2)`,
                    borderLeft: `3px solid ${A.err}`, borderRadius: 4, padding: '10px 14px',
                    fontFamily: A.mono, fontSize: 11, color: A.err,
                }}>
                    ✗ {installStatusData.error}
                </div>
            )}

            {/* FTB terminal yönlendirme hint */}
            {terminalHint && (
                <div style={{
                    background: 'rgba(251,191,36,0.06)', border: `1px solid rgba(251,191,36,0.2)`,
                    borderLeft: `3px solid ${A.warn}`, borderRadius: 4, padding: '12px 14px',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                    <I.Terminal size={14} style={{ color: A.warn, flexShrink: 0, marginTop: 2 }}/>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: A.warn, fontWeight: 600, marginBottom: 4 }}>
                            Manuel kurulum adımları gerekiyor
                        </div>
                        <div style={{ fontSize: 11, color: A.dim, lineHeight: 1.5, marginBottom: 8 }}>
                            <strong style={{ color: A.text }}>{terminalHint.name}</strong> dosyaları indirildi.
                            FTB sunucu kurulumunu tamamlamak için terminale geçin.
                        </div>
                        <div style={{
                            fontFamily: A.mono, fontSize: 10, color: A.warn,
                            background: 'rgba(251,191,36,0.06)', padding: '5px 8px', borderRadius: 2,
                        }}>
                            cd &quot;{terminalHint.installPath}&quot; &amp;&amp; java -jar *installer*.jar --installServer
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openTerminalForInstall(terminalHint.installPath)}
                            style={{
                                ...btnPrimary, display: 'flex', alignItems: 'center',
                                gap: 5, fontSize: 10, padding: '5px 10px',
                            }}>
                            <I.Terminal size={11}/> TERMİNAL
                        </button>
                        <button onClick={() => setTerminalHint(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                            <I.X size={14}/>
                        </button>
                    </div>
                </div>
            )}

            {/* Popüler başlık */}
            {activeTab === 'search' && !searchResults && !searching && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <I.Stack size={13} style={{ color: A.warn }}/>
                    <Cap>Popüler Modpackler</Cap>
                    <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>· {provider}</span>
                </div>
            )}

            {/* ── Kart Grid ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 10,
            }}>
                {(searching || loadingPopular || loadingInstalled) ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '14px', display: 'flex', gap: 12,
                        }}>
                            <div style={{ width: 56, height: 56, background: A.bgDeeper, borderRadius: 2, flexShrink: 0 }}/>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ height: 12, background: A.bgDeeper, borderRadius: 2, width: '70%' }}/>
                                <div style={{ height: 10, background: A.bgDeeper, borderRadius: 2, width: '100%' }}/>
                                <div style={{ height: 10, background: A.bgDeeper, borderRadius: 2, width: '50%' }}/>
                            </div>
                        </div>
                    ))
                ) : modpacksToShow.length > 0 ? (
                    modpacksToShow.map(modpack => (
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
                            onOpenTerminal={() => openTerminalForInstall(modpack.install_path)}
                            onManageFiles={() => setManualPackModal({ id: modpack.id, name: modpack.name })}
                            installing={installMutation.isPending}
                            uninstalling={uninstallMutation.isPending}
                            activating={activateMutation.isPending}
                        />
                    ))
                ) : (
                    <div style={{
                        gridColumn: '1 / -1', display: 'flex',
                        flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', padding: '48px 0', gap: 10,
                    }}>
                        <I.Cube size={32} style={{ color: A.faintest }}/>
                        <span style={{ fontFamily: A.mono, fontSize: 12, color: A.faintest }}>
                            {activeTab === 'installed'
                                ? 'Henüz yüklü modpack yok'
                                : 'Arama yapmak için yukarıdaki çubuğu kullanın'}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Modaller ── */}
            {editingModpack && (
                <ModpackSettingsModal
                    modpack={editingModpack}
                    onClose={() => setEditingModpack(null)}
                    onSave={(settings) => updateSettingsMutation.mutate({ id: editingModpack.id, settings })}
                    saving={updateSettingsMutation.isPending}
                />
            )}

            {createManualOpen && (
                <CreateManualModal
                    onClose={() => setCreateManualOpen(false)}
                    onCreate={(name) => createManualMutation.mutate(name)}
                    creating={createManualMutation.isPending}
                />
            )}

            {manualPackModal && (
                <ManualPackModal
                    pack={manualPackModal}
                    onClose={() => { setManualPackModal(null); queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] }); }}
                />
            )}

            {confirmSwitch && (
                <Modal onClose={() => setConfirmSwitch(null)} maxWidth={440}>
                    <ModalHeader title="Sunucu Açık — Profil Değiştir" onClose={() => setConfirmSwitch(null)}/>
                    <div style={{ padding: '16px', color: A.dim, fontSize: 13, lineHeight: 1.6 }}>
                        <span style={{ color: A.text }}>{activeProfileData?.profile?.name}</span> çalışıyor.&nbsp;
                        <span style={{ color: 'var(--accent)' }}>{confirmSwitch.name}</span> profiline geçmek için
                        sunucu kapatılacak. Devam edilsin mi?
                    </div>
                    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                        <button onClick={() => setConfirmSwitch(null)} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                        <button onClick={() => activateMutation.mutate(confirmSwitch.id)}
                            disabled={activateMutation.isPending}
                            style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {activateMutation.isPending ? <Spinner size={12}/> : null}
                            GEÇİŞ YAP
                        </button>
                    </div>
                </Modal>
            )}

            {versionModal && (
                <VersionSelectModal
                    title={`Sürüm Seç — ${versionModal.modpack.name}`}
                    files={versionModal.files}
                    loading={versionModal.loading}
                    onClose={() => setVersionModal(null)}
                    onSelect={(fileId) => handleInstallVersion(versionModal.modpack, fileId)}
                    isPending={installMutation.isPending}
                    buttonLabel="YÜKLE"
                />
            )}

            {validationModal && (
                <ValidationModal
                    modpack={validationModal.modpack}
                    loading={validationModal.loading}
                    analysis={validationModal.analysis}
                    onClose={() => setValidationModal(null)}
                    onRepair={(selectedIds) => handleRepair(selectedIds, validationModal.analysis, validationModal.modpack)}
                />
            )}

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

            {updateVersionModal && (
                <VersionSelectModal
                    title={`Sürüm Değiştir — ${updateVersionModal.modpack.name}`}
                    subtitle={`Mevcut: ${updateVersionModal.modpack.file_display_name || updateVersionModal.modpack.version}`}
                    files={updateVersionModal.files}
                    loading={updateVersionModal.loading}
                    onClose={() => setUpdateVersionModal(null)}
                    onSelect={(fileId) => handleUpdateVersion(updateVersionModal.modpack, fileId)}
                    isPending={updateModpackMutation.isPending}
                    buttonLabel="GÜNCELLE"
                />
            )}
        </div>
    );
}

// ── Modpack kartı ────────────────────────────────────────────────────────
function ModpackCard({ modpack, isInstalled, isActive, onInstall, onUninstall, onSettings, onActivate, onChangeVersion, onValidate, onOpenTerminal, onManageFiles, installing, uninstalling, activating }) {
    const isManual = modpack.provider === 'manual';
    return (
        <div style={{
            background: A.panel,
            border: `1px solid ${isActive ? 'rgba(74,222,128,0.3)' : A.border}`,
            borderRadius: 4, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 12, position: 'relative',
        }}>
            {isActive && (
                <div style={{
                    position: 'absolute', top: -1, right: 16,
                    background: A.ok, color: '#000',
                    fontFamily: A.mono, fontSize: 9, fontWeight: 700,
                    padding: '3px 8px', letterSpacing: '0.06em',
                    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
                }}>
                    AKTİF
                </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
                {/* Logo */}
                <div style={{
                    width: 52, height: 52, borderRadius: 2, flexShrink: 0,
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {(modpack.logoUrl || modpack.logo_url) ? (
                        <img src={modpack.logoUrl || modpack.logo_url} alt={modpack.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy"/>
                    ) : (
                        <I.Cube size={20} style={{ color: A.faintest }}/>
                    )}
                </div>
                {/* Bilgi */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {modpack.name}
                    </div>
                    <div style={{
                        fontSize: 11, color: A.faint, lineHeight: 1.5, marginTop: 3,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                        {modpack.summary || modpack.version || 'Açıklama yok'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                        {modpack.author && (
                            <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                {modpack.author}
                            </span>
                        )}
                        {modpack.downloadCount && (
                            <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                ↓{formatNumber(modpack.downloadCount)}
                            </span>
                        )}
                        {modpack.installed_at && (
                            <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                {formatDate(modpack.installed_at)}
                            </span>
                        )}
                    </div>
                    {modpack.server_port && modpack.server_port !== 25565 && (
                        <div style={{ fontFamily: A.mono, fontSize: 10, color: 'var(--accent)', marginTop: 3 }}>
                            port:{modpack.server_port}
                        </div>
                    )}
                    {isInstalled && <HealthBadge lastHealth={modpack.last_health}/>}
                    {isInstalled && modpack.id && <MissingModsChip modpackId={modpack.id}/>}
                    {modpack.latestFiles?.[0]?.gameVersions && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                            {modpack.latestFiles[0].gameVersions.slice(0, 3).map((v, i) => (
                                <Pill key={i}>{v}</Pill>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Aksiyon butonları */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {isInstalled ? (
                    <>
                        {!isActive && (
                            <button onClick={onActivate} disabled={activating}
                                style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                                <I.Play size={10}/> AKTİF YAP
                            </button>
                        )}
                        {isManual && (
                            <button onClick={onManageFiles}
                                style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                                <I.Download size={10}/> DOSYA EKLE
                            </button>
                        )}
                        <button onClick={onValidate}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                            <I.Wrench size={10}/> DOĞRULA
                        </button>
                        <HealthCheckButton modpackId={modpack.id}/>
                        <RollbackButton modpackId={modpack.id}/>
                        {modpack.install_path && (
                            <button onClick={onOpenTerminal}
                                style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                                <I.Terminal size={10}/> TERMİNAL
                            </button>
                        )}
                        <button onClick={onChangeVersion}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                            <I.Restart size={10}/> SÜRÜM
                        </button>
                        <button onClick={onSettings}
                            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px' }}>
                            <I.Cog size={10}/> AYAR
                        </button>
                        <button onClick={onUninstall} disabled={uninstalling}
                            style={{
                                ...btnGhost, display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: 10, padding: '5px 10px',
                                color: A.err, borderColor: 'rgba(248,113,113,0.2)',
                            }}>
                            <I.Trash size={10}/> KALDIR
                        </button>
                    </>
                ) : (
                    <button onClick={onInstall} disabled={installing}
                        style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '5px 12px' }}>
                        <I.Download size={10}/> SÜRÜM SEÇ & YÜKLE
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Sağlık rozeti (son açılış testi sonucu) ─────────────────────────────────
function HealthBadge({ lastHealth }) {
    if (!lastHealth) return null;
    let h;
    try { h = typeof lastHealth === 'string' ? JSON.parse(lastHealth) : lastHealth; } catch { return null; }
    if (!h?.status) return null;
    const map = {
        success: { text: `✓ Açılış doğrulandı (${h.durationSec || '?'}sn)`, color: A.ok },
        fail: { text: '✗ Açılış testi başarısız', color: A.err },
        timeout: { text: '⏱ Açılış testi zaman aşımı', color: A.warn },
    };
    const m = map[h.status];
    if (!m) return null;
    return (
        <div title={h.detail || ''} style={{ fontFamily: A.mono, fontSize: 10, color: m.color, marginTop: 3 }}>
            {m.text}
        </div>
    );
}

// ── Açılış testi butonu (kurulum sonrası "gerçekten açılıyor mu" kontrolü) ──
function HealthCheckButton({ modpackId }) {
    const queryClient = useQueryClient();
    const { data: status } = useQuery({
        queryKey: ['modpackHealth', modpackId],
        queryFn: () => api.get(`/modpacks/${modpackId}/health-check`).then(r => r.data),
        refetchInterval: (q) => (q.state.data?.running ? 5000 : false),
    });

    const runMutation = useMutation({
        mutationFn: () => api.post(`/modpacks/${modpackId}/health-check`).then(r => r.data),
        onSuccess: (data) => {
            toast.success(data.message || 'Test başlatıldı');
            queryClient.invalidateQueries({ queryKey: ['modpackHealth', modpackId] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Test başlatılamadı'),
    });

    // Test bittiğinde kart listesini tazele (last_health rozeti güncellensin)
    useEffect(() => {
        if (status && !status.running && status.last) {
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        }
    }, [status?.running]); // eslint-disable-line react-hooks/exhaustive-deps

    const testing = status?.running || runMutation.isPending;
    return (
        <button onClick={() => runMutation.mutate()} disabled={testing}
            title="Sunucuyu başlatıp 'Done!' satırını bekler, sonra kapatır — paketin gerçekten açıldığını doğrular"
            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px', opacity: testing ? 0.6 : 1 }}>
            {testing ? <Spinner size={10}/> : <I.Play size={10}/>} {testing ? 'TEST SÜRÜYOR' : 'AÇILIŞ TESTİ'}
        </button>
    );
}

// ── Geri alma butonu (son güncellemeden önceki sürüme dön) ──────────────────
function RollbackButton({ modpackId }) {
    const queryClient = useQueryClient();
    const { data: info } = useQuery({
        queryKey: ['modpackRollback', modpackId],
        queryFn: () => api.get(`/modpacks/${modpackId}/rollback`).then(r => r.data),
        staleTime: 60 * 1000,
    });

    const rollbackMutation = useMutation({
        mutationFn: () => api.post(`/modpacks/${modpackId}/rollback`).then(r => r.data),
        onSuccess: (data) => {
            toast.success(data.message || 'Önceki sürüme dönüldü');
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
            queryClient.invalidateQueries({ queryKey: ['modpackRollback', modpackId] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Geri alma başarısız'),
    });

    if (!info?.available) return null;
    return (
        <button
            onClick={() => {
                if (window.confirm(`Son güncelleme geri alınsın mı?\nÖnceki sürüm: ${info.version || 'bilinmiyor'}\n(Dünyalar etkilenmez)`)) {
                    rollbackMutation.mutate();
                }
            }}
            disabled={rollbackMutation.isPending}
            title={`Önceki sürüme dön: ${info.version || '?'}`}
            style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px', color: A.warn, borderColor: 'rgba(251,191,36,0.25)' }}>
            {rollbackMutation.isPending ? <Spinner size={10}/> : <I.Restart size={10}/>} GERİ AL
        </button>
    );
}

// ── Eksik mod rozeti + tamamlama modalı ─────────────────────────────────────
function MissingModsChip({ modpackId }) {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: ['missingMods', modpackId],
        queryFn: () => api.get(`/modpacks/${modpackId}/missing-mods`).then(r => r.data),
        staleTime: 60 * 1000,
    });

    const uploadMutation = useMutation({
        mutationFn: (file) => {
            const fd = new FormData();
            fd.append('file', file);
            return api.post(`/modpacks/${modpackId}/missing-mods/upload`, fd).then(r => r.data);
        },
        onSuccess: (res) => {
            toast.success(res.message || 'Mod yüklendi');
            queryClient.invalidateQueries({ queryKey: ['missingMods', modpackId] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const pending = (data?.items || []).filter(i => !i.resolved);
    if (pending.length === 0) return null;

    return (
        <>
            <button onClick={() => setOpen(true)} style={{
                marginTop: 4, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
                color: A.warn, fontFamily: A.mono, fontSize: 10, padding: '3px 8px',
                borderRadius: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
                <I.Alert size={10}/> {pending.length} eksik mod — tamamla
            </button>

            {open && (
                <Modal onClose={() => setOpen(false)} maxWidth={640}>
                    <ModalHeader title={`Eksik Modlar (${pending.length})`} onClose={() => setOpen(false)}/>
                    <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11.5, color: A.faint, lineHeight: 1.5 }}>
                            Bu modların yazarları otomatik indirmeyi kapatmış. Linkten elle indirip
                            buradan yükleyin — dosya doğrudan <code>mods/</code> klasörüne kaydedilir.
                        </div>
                        {(data?.items || []).map((item, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                background: A.bg, border: `1px solid ${A.border}`, borderRadius: 2,
                                opacity: item.resolved ? 0.5 : 1,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: A.mono, fontSize: 11, color: item.resolved ? A.ok : A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.resolved ? '✓ ' : ''}{item.fileName || `proje #${item.projectID}`}
                                    </div>
                                    <div style={{ fontSize: 10, color: A.faint, marginTop: 2 }}>{item.reason}</div>
                                </div>
                                <a href={item.url} target="_blank" rel="noreferrer"
                                    style={{ ...btnGhost, fontSize: 10, padding: '4px 8px', textDecoration: 'none' }}>
                                    SAYFA
                                </a>
                                {!item.resolved && (
                                    <label style={{ ...btnPrimary, fontSize: 10, padding: '4px 8px', cursor: 'pointer' }}>
                                        {uploadMutation.isPending ? '...' : 'YÜKLE'}
                                        <input type="file" accept=".jar" style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) uploadMutation.mutate(f);
                                                e.target.value = '';
                                            }}/>
                                    </label>
                                )}
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </>
    );
}

// ── Elle modpack oluştur (isim) ─────────────────────────────────────────────
function CreateManualModal({ onClose, onCreate, creating }) {
    const [name, setName] = useState('');
    return (
        <Modal onClose={onClose} maxWidth={440}>
            <ModalHeader title="Elle Modpack Oluştur" onClose={onClose}/>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: A.faint, lineHeight: 1.5 }}>
                    Boş bir modpack profili oluşturun. Sonra "Dosya Ekle" ile zip, server.jar,
                    mod veya config yükleyin — sistem dosyaları otomatik yerleştirir.
                </div>
                <div>
                    {fieldLabel('Modpack Adı')}
                    <input type="text" value={name} autoFocus
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); }}
                        placeholder="Örn: Özel Survival Paketi" style={inputStyle}/>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                <button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim() || creating}
                    style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: !name.trim() ? 0.5 : 1 }}>
                    {creating ? <Spinner size={12}/> : <I.Plus size={12}/>} OLUŞTUR
                </button>
            </div>
        </Modal>
    );
}

// ── Elle modpack dosya yönetimi (yükle + çalıştırılabilir yap) ──────────────
function ManualPackModal({ pack, onClose }) {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const { data: files } = useQuery({
        queryKey: ['manualFiles', pack.id],
        queryFn: () => api.get(`/modpacks/${pack.id}/files-list`).then(r => r.data),
        refetchInterval: uploading ? 1500 : false,
    });

    const uploadMutation = useMutation({
        mutationFn: (file) => {
            const fd = new FormData();
            fd.append('file', file);
            return api.post(`/modpacks/${pack.id}/files/upload`, fd).then(r => r.data);
        },
        onSuccess: (res) => {
            toast.success(res.message || 'Yüklendi');
            queryClient.invalidateQueries({ queryKey: ['manualFiles', pack.id] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yükleme başarısız'),
    });

    const makeRunnableMutation = useMutation({
        mutationFn: () => api.post(`/modpacks/${pack.id}/make-runnable`).then(r => r.data),
        onSuccess: (res) => {
            toast.success(res.message || 'Çalıştırılabilir hale getirildi', { duration: 6000 });
            queryClient.invalidateQueries({ queryKey: ['manualFiles', pack.id] });
            queryClient.invalidateQueries({ queryKey: ['modpackInstalled'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'İşlem başarısız'),
    });

    // Birden çok dosyayı sırayla yükle (büyük zip'lerde paralel yükleme riskli)
    const handleFiles = async (fileList) => {
        const arr = Array.from(fileList);
        if (arr.length === 0) return;
        setUploading(true);
        for (const f of arr) {
            try { await uploadMutation.mutateAsync(f); } catch { /* tekil hata toast'landı */ }
        }
        setUploading(false);
    };

    const rootFiles = files?.root || [];
    const modFiles = files?.mods || [];

    return (
        <Modal onClose={onClose} maxWidth={620}>
            <ModalHeader title={`Dosya Yönetimi — ${pack.name}`} onClose={onClose}/>
            <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Yükleme alanı */}
                <label style={{
                    border: `1.5px dashed ${A.border}`, borderRadius: 4, padding: '20px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    cursor: uploading ? 'wait' : 'pointer', textAlign: 'center',
                }}>
                    {uploading ? <Spinner size={18}/> : <I.Download size={18} style={{ color: 'var(--accent)' }}/>}
                    <div style={{ fontSize: 12.5, color: A.text }}>
                        {uploading ? 'Yükleniyor…' : 'Dosya seç veya sürükle — zip / server.jar / mod / config'}
                    </div>
                    <div style={{ fontSize: 11, color: A.faint }}>
                        Sistem türü algılayıp doğru yere koyar (zip açılır, mod → mods/, jar → kök)
                    </div>
                    <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
                        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}/>
                </label>

                {/* Dosya listesi */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <Cap style={{ fontSize: 10 }}>Kök ({rootFiles.length})</Cap>
                        <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {rootFiles.length === 0 ? <span style={{ fontSize: 11, color: A.faintest }}>boş</span>
                                : rootFiles.map((f, i) => (
                                    <div key={i} style={{ fontFamily: A.mono, fontSize: 10.5, color: A.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</div>
                                ))}
                        </div>
                    </div>
                    <div>
                        <Cap style={{ fontSize: 10 }}>mods/ ({modFiles.length})</Cap>
                        <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {modFiles.length === 0 ? <span style={{ fontSize: 11, color: A.faintest }}>boş</span>
                                : modFiles.map((f, i) => (
                                    <div key={i} style={{ fontFamily: A.mono, fontSize: 10.5, color: A.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</div>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>KAPAT</button>
                <button onClick={() => makeRunnableMutation.mutate()} disabled={makeRunnableMutation.isPending || uploading}
                    title="Yüklenen dosyaları tespit edip Java/loader/script ile başlatılabilir hale getirir"
                    style={{ ...btnPrimary, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {makeRunnableMutation.isPending ? <Spinner size={12}/> : <I.Play size={12}/>} ÇALIŞTIRILABİLİR YAP
                </button>
            </div>
        </Modal>
    );
}

// ── Sürüm seçim modalı ───────────────────────────────────────────────────
function VersionSelectModal({ title, subtitle, files, loading, onClose, onSelect, isPending, buttonLabel }) {
    const [selectedFileId, setSelectedFileId] = useState(null);
    return (
        <Modal onClose={onClose} maxWidth={560}>
            <ModalHeader title={title} onClose={onClose}/>
            {subtitle && (
                <div style={{ padding: '6px 16px', borderBottom: `1px solid ${A.border}`, fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                    {subtitle}
                </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10 }}>
                        <Spinner/>
                        <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>Sürümler yükleniyor...</span>
                    </div>
                ) : files.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: A.faintest, fontFamily: A.mono, fontSize: 11 }}>
                        Sürüm bulunamadı
                    </div>
                ) : (
                    files.map(file => (
                        <div key={file.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 16px', borderBottom: `1px solid ${A.border}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.displayName}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                    {file.fileLength && (
                                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                            {formatSize(file.fileLength)}
                                        </span>
                                    )}
                                    {file.fileDate && (
                                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                            {formatFileDate(file.fileDate)}
                                        </span>
                                    )}
                                    {file.gameVersions?.slice(0, 3).map((v, i) => (
                                        <Pill key={i}>{v}</Pill>
                                    ))}
                                    {file.serverPackFileId && (
                                        <Pill color={A.ok} bg="rgba(74,222,128,0.1)">Server Pack</Pill>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedFileId(file.id); onSelect(file.id); }}
                                disabled={isPending}
                                style={{
                                    ...btnPrimary, fontSize: 10, padding: '5px 10px',
                                    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                                    opacity: isPending ? 0.5 : 1,
                                }}>
                                {isPending && selectedFileId === file.id
                                    ? <Spinner size={10}/>
                                    : <><I.Download size={10}/> {buttonLabel}</>
                                }
                            </button>
                        </div>
                    ))
                )}
            </div>
        </Modal>
    );
}

// ── Doğrulama modalı ─────────────────────────────────────────────────────
function ValidationModal({ modpack, loading, analysis, onClose, onRepair }) {
    const [selected, setSelected] = useState({});
    const allIssues = analysis?.issues || [];

    const toggleIssue = (id, canSkip) => {
        if (!canSkip) return;
        setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isSelected = (issue) => {
        if (!issue.canSkip) return true;
        return selected[issue.id] !== false;
    };

    const selectedIds = allIssues.filter(i => isSelected(i)).map(i => i.id);

    const severityColor = (severity) => ({
        error: A.err, warning: A.warn, info: '#60a5fa',
    }[severity] || A.faint);

    return (
        <Modal onClose={onClose} maxWidth={580}>
            <ModalHeader title={`Doğrula & Onar — ${modpack.name}`} onClose={onClose}/>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 10 }}>
                        <Spinner size={18}/>
                        <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>Analiz ediliyor...</span>
                    </div>
                ) : analysis ? (
                    <>
                        {/* Tespit bilgisi */}
                        <div style={{
                            background: A.bgDeeper, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '12px 14px', marginBottom: 16,
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                        }}>
                            {[
                                ['Paket Tipi', analysis.detectedInfo?.packageType || '?'],
                                ['Loader', analysis.detectedInfo?.loader || '?'],
                                ['MC Sürümü', analysis.detectedInfo?.mcVersion || '?'],
                                ['Gerekli Java', analysis.detectedInfo?.requiredJava ? `Java ${analysis.detectedInfo.requiredJava}` : '?'],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Cap>{label}</Cap>
                                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.text }}>{value}</span>
                                </div>
                            ))}
                        </div>

                        {allIssues.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: A.ok }}>
                                <I.Check size={32} style={{ marginBottom: 8 }}/>
                                <div style={{ fontFamily: A.mono, fontSize: 12 }}>Sorun bulunamadı!</div>
                                <div style={{ fontSize: 11, color: A.faint, marginTop: 4 }}>Sunucu başlatılmaya hazır.</div>
                            </div>
                        ) : (
                            <>
                                <div style={{ fontSize: 11, color: A.faint, marginBottom: 10 }}>
                                    {allIssues.length} sorun tespit edildi:
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {allIssues.map(issue => {
                                        const sel = isSelected(issue);
                                        const c = severityColor(issue.severity);
                                        return (
                                            <div key={issue.id}
                                                onClick={() => toggleIssue(issue.id, issue.canSkip)}
                                                style={{
                                                    padding: '10px 12px', borderRadius: 2,
                                                    border: `1px solid ${sel ? c + '44' : A.border}`,
                                                    background: sel ? c + '0d' : A.bgDeeper,
                                                    cursor: issue.canSkip ? 'pointer' : 'not-allowed',
                                                    opacity: issue.canSkip ? 1 : 0.9,
                                                }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                                                        {sel
                                                            ? <I.Check size={14} style={{ color: c }}/>
                                                            : <div style={{ width: 14, height: 14, borderRadius: 2, border: `1.5px solid ${A.border}` }}/>
                                                        }
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontSize: 12, color: A.text, fontWeight: 500 }}>{issue.title}</span>
                                                            {!issue.canSkip && (
                                                                <Pill color={A.err} bg="rgba(248,113,113,0.1)">ZORUNLU</Pill>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: A.faint, marginTop: 3 }}>{issue.description}</div>
                                                        <div style={{ fontFamily: A.mono, fontSize: 10, color: c, marginTop: 4 }}>→ {issue.action}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </>
                ) : null}
            </div>
            {analysis && allIssues.length > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                    <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                    <button onClick={() => onRepair(selectedIds)} disabled={selectedIds.length === 0}
                        style={{
                            ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 6,
                            opacity: selectedIds.length === 0 ? 0.4 : 1,
                        }}>
                        <I.Wrench size={11}/> {selectedIds.length} SORUNU ONAR
                    </button>
                </div>
            )}
        </Modal>
    );
}

// ── Onarım ilerleme modalı ───────────────────────────────────────────────
function RepairProgressModal({ status, modpackId, onClose }) {
    const [verifyResult, setVerifyResult] = useState(null);

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
        <Modal onClose={isDone ? onClose : undefined} maxWidth={520}>
            <div style={{
                padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
                {isDone
                    ? hasError
                        ? <I.Alert size={14} style={{ color: A.err }}/>
                        : <I.Check size={14} style={{ color: A.ok }}/>
                    : <Spinner size={14}/>
                }
                <Cap>{isDone ? (hasError ? 'Onarım Hatası' : 'Onarım Tamamlandı') : 'Onarım Devam Ediyor...'}</Cap>
                {isDone && (
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, marginLeft: 'auto' }}>
                        <I.X size={14}/>
                    </button>
                )}
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Progress bar */}
                <div style={{ background: A.bg, border: `1px solid ${A.border}`, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${progress}%`,
                        background: hasError ? A.err : 'var(--accent)',
                        transition: 'width 300ms ease', borderRadius: 2,
                    }}/>
                </div>

                {/* Log */}
                <div style={{
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    borderRadius: 2, padding: '8px 12px',
                    height: 140, overflowY: 'auto',
                    fontFamily: A.mono, fontSize: 10, lineHeight: 1.6,
                }}>
                    {log.length === 0 ? (
                        <span style={{ color: A.faintest }}>Başlatılıyor...</span>
                    ) : (
                        log.map((line, i) => (
                            <div key={i} style={{ color: line.startsWith('Hata') ? A.err : A.ok }}>{line}</div>
                        ))
                    )}
                </div>

                {isDone && !hasError && !verifyResult && (
                    <button onClick={handleVerify}
                        style={{ ...btnGhost, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <I.Check size={11}/> FİNAL DOĞRULAMASI YAP
                    </button>
                )}

                {verifyResult && (
                    <div style={{
                        background: verifyResult.ready ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)',
                        border: `1px solid ${verifyResult.ready ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
                        borderRadius: 2, padding: '8px 12px',
                        fontFamily: A.mono, fontSize: 11,
                        color: verifyResult.ready ? A.ok : A.warn,
                    }}>
                        <div style={{ fontWeight: 600 }}>{verifyResult.summary}</div>
                        {verifyResult.issues?.length > 0 && (
                            <ul style={{ marginTop: 6, paddingLeft: 0, listStyle: 'none', fontSize: 10 }}>
                                {verifyResult.issues.map((issue, i) => (
                                    <li key={i} style={{ marginTop: 2 }}>· {issue}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {isDone && (
                    <button onClick={onClose} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', display: 'flex' }}>
                        KAPAT
                    </button>
                )}
            </div>
        </Modal>
    );
}

// ── Modpack ayarlar modalı ───────────────────────────────────────────────
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
    const [settingsTab, setSettingsTab] = useState('port');
    const [portError, setPortError] = useState('');
    const [settings, setSettings] = useState({
        server_port: modpack.server_port || 25565,
        minRam: modpack.min_ram || '2G',
        maxRam: modpack.max_ram || '4G',
        jvmArgs: modpack.jvm_args || '',
        properties: {},
    });

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
        if (isNaN(n) || n < 1024 || n > 65535) { setPortError('Port 1024–65535 arasında olmalı'); return false; }
        setPortError('');
        return true;
    };
    const handleSave = () => { if (!validatePort(settings.server_port)) return; onSave(settings); };
    const hasProperties = Object.keys(settings.properties || {}).length > 0;
    const TABS = [
        { id: 'port', label: 'Bağlantı' },
        { id: 'ram', label: 'Bellek' },
        { id: 'jvm', label: 'JVM' },
        { id: 'props', label: 'Oyun Ayarları' },
    ];

    // ── input yardımcısı ─
    const fieldStyle = {
        background: A.bg, border: `1px solid ${A.border}`,
        color: A.text, fontFamily: A.mono, fontSize: 12,
        padding: '6px 10px', borderRadius: 2, outline: 'none',
    };

    const ramBtn = (p, current, setter) => (
        <button key={p} onClick={() => setter(p)}
            style={{
                padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                fontFamily: A.mono, fontSize: 11, border: `1px solid`,
                background: current === p ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: current === p ? 'var(--accent)' : A.dim,
                borderColor: current === p ? 'rgba(167,139,250,0.3)' : A.border,
            }}>
            {p}
        </button>
    );

    return (
        <Modal onClose={onClose} maxWidth={640}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderBottom: `1px solid ${A.border}`, flexShrink: 0,
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 2,
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {modpack.logo_url
                        ? <img src={modpack.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        : <I.Cog size={16} style={{ color: A.faint }}/>
                    }
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{modpack.name}</div>
                    <Cap>{modpack.version}</Cap>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                    <I.X size={16}/>
                </button>
            </div>

            {/* Alt sekmeler */}
            <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', borderBottom: `1px solid ${A.border}`, flexShrink: 0 }}>
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setSettingsTab(tab.id)}
                        style={{
                            padding: '6px 12px', border: 'none', cursor: 'pointer',
                            fontFamily: A.sans, fontSize: 12, borderRadius: '2px 2px 0 0',
                            background: settingsTab === tab.id ? A.bgDeeper : 'transparent',
                            color: settingsTab === tab.id ? A.text : A.dim,
                            borderBottom: `2px solid ${settingsTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* İçerik */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                        <Spinner size={18}/>
                    </div>
                ) : (
                    <>
                        {/* Bağlantı */}
                        {settingsTab === 'port' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{
                                    background: 'rgba(96,165,250,0.06)', border: `1px solid rgba(96,165,250,0.15)`,
                                    borderRadius: 2, padding: '10px 12px', fontSize: 11, color: '#93c5fd',
                                }}>
                                    Farklı port kullanarak aynı makinede birden fazla sunucu eş zamanlı çalıştırabilirsiniz.
                                </div>
                                <div>
                                    <Cap style={{ display: 'block', marginBottom: 8 }}>Sunucu Portu</Cap>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input type="number" value={settings.server_port}
                                            onChange={e => { set('server_port', parseInt(e.target.value) || ''); validatePort(e.target.value); }}
                                            min={1024} max={65535}
                                            style={{ ...fieldStyle, width: 120, fontSize: 16, textAlign: 'center', borderColor: portError ? A.err : A.border }}
                                        />
                                        <button onClick={() => { set('server_port', 25565); setPortError(''); }}
                                            style={{ ...btnGhost, fontSize: 10 }}>VARSAYILAN (25565)</button>
                                    </div>
                                    {portError && <div style={{ fontFamily: A.mono, fontSize: 10, color: A.err, marginTop: 4 }}>{portError}</div>}
                                </div>
                                <div>
                                    <Cap style={{ display: 'block', marginBottom: 8 }}>Hızlı Seçim</Cap>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {[25565, 25566, 25567, 19132, 19133].map(p => (
                                            <button key={p} onClick={() => { set('server_port', p); setPortError(''); }}
                                                style={{
                                                    padding: '4px 12px', borderRadius: 2, cursor: 'pointer',
                                                    fontFamily: A.mono, fontSize: 11,
                                                    background: settings.server_port === p ? 'rgba(167,139,250,0.12)' : 'transparent',
                                                    color: settings.server_port === p ? 'var(--accent)' : A.dim,
                                                    border: `1px solid ${settings.server_port === p ? 'rgba(167,139,250,0.3)' : A.border}`,
                                                }}>
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bellek */}
                        {settingsTab === 'ram' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {[
                                    { label: 'Maksimum RAM', key: 'maxRam' },
                                    { label: 'Minimum RAM', key: 'minRam' },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <Cap>{label}</Cap>
                                            <span style={{ fontFamily: A.mono, fontSize: 14, color: 'var(--accent)' }}>{settings[key]}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {(key === 'minRam' ? RAM_PRESETS.slice(0, 6) : RAM_PRESETS).map(p => ramBtn(p, settings[key], (v) => set(key, v)))}
                                        </div>
                                        <input value={settings[key]} onChange={e => set(key, e.target.value)}
                                            placeholder="Özel: 6G, 10G..."
                                            style={{ ...fieldStyle, width: '100%' }}
                                            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                            onBlur={e => e.target.style.borderColor = A.border}
                                        />
                                    </div>
                                ))}
                                <div style={{
                                    background: 'rgba(251,191,36,0.06)', border: `1px solid rgba(251,191,36,0.15)`,
                                    borderRadius: 2, padding: '8px 12px', fontSize: 11, color: A.warn,
                                }}>
                                    Öneri: Max RAM = sistem RAM'inin %70-80'i. Örnek: 16GB sistem → Max: 12G, Min: 4G
                                </div>
                            </div>
                        )}

                        {/* JVM */}
                        {settingsTab === 'jvm' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Cap>JVM Argümanları</Cap>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => set('jvmArgs', AIKARS_FLAGS)}
                                            style={{
                                                ...btnGhost, fontSize: 10, color: A.ok,
                                                borderColor: 'rgba(74,222,128,0.2)',
                                            }}>
                                            ✦ AIKAR FLAGS
                                        </button>
                                        <button onClick={() => set('jvmArgs', '')}
                                            style={{ ...btnGhost, fontSize: 10 }}>
                                            TEMİZLE
                                        </button>
                                    </div>
                                </div>
                                <textarea value={settings.jvmArgs} onChange={e => set('jvmArgs', e.target.value)}
                                    rows={6} placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled ..."
                                    spellCheck={false}
                                    style={{
                                        ...fieldStyle, width: '100%', resize: 'vertical',
                                        fontFamily: A.mono, fontSize: 10, lineHeight: 1.6,
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                    onBlur={e => e.target.style.borderColor = A.border}
                                />
                                {settings.jvmArgs && (
                                    <div style={{
                                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                                        borderRadius: 2, padding: '8px 10px',
                                        fontFamily: A.mono, fontSize: 10, color: A.dim, lineHeight: 1.5,
                                        wordBreak: 'break-all',
                                    }}>
                                        <Cap style={{ display: 'block', marginBottom: 4 }}>Önizleme</Cap>
                                        java -Xmx{settings.maxRam || '4G'} -Xms{settings.minRam || '2G'} {settings.jvmArgs} -jar server.jar nogui
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Oyun Ayarları */}
                        {settingsTab === 'props' && (
                            <div>
                                {!hasProperties ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                        <I.Cog size={28} style={{ color: A.faintest, marginBottom: 10 }}/>
                                        <div style={{ fontSize: 12, color: A.faint }}>server.properties bulunamadı</div>
                                        <div style={{ fontSize: 11, color: A.faintest, marginTop: 6 }}>
                                            Sunucuyu en az bir kez başlatın — dosya otomatik oluşturulur.
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {PROPS_GROUPS.map(group => {
                                            const groupProps = group.keys.filter(k => k.key in settings.properties);
                                            if (groupProps.length === 0) return null;
                                            return (
                                                <div key={group.label}>
                                                    <Cap style={{ display: 'block', marginBottom: 10 }}>{group.label}</Cap>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                                        {groupProps.map(({ key, label, type, options }) => {
                                                            const value = settings.properties[key] ?? '';
                                                            return (
                                                                <div key={key} style={{
                                                                    display: 'flex', alignItems: 'center',
                                                                    justifyContent: 'space-between', gap: 12,
                                                                    padding: '8px 0',
                                                                    borderBottom: `1px solid ${A.border}`,
                                                                }}>
                                                                    <div>
                                                                        <div style={{ fontSize: 12, color: A.text }}>{label}</div>
                                                                        <div style={{ fontFamily: A.mono, fontSize: 9, color: A.faintest }}>{key}</div>
                                                                    </div>
                                                                    <div style={{ flexShrink: 0 }}>
                                                                        {type === 'boolean' ? (
                                                                            <button onClick={() => setProp(key, value === 'true' ? 'false' : 'true')}
                                                                                style={{
                                                                                    padding: '4px 12px', borderRadius: 2,
                                                                                    border: `1px solid`, cursor: 'pointer',
                                                                                    fontFamily: A.mono, fontSize: 10, minWidth: 60,
                                                                                    background: value === 'true' ? 'rgba(74,222,128,0.1)' : 'transparent',
                                                                                    color: value === 'true' ? A.ok : A.faint,
                                                                                    borderColor: value === 'true' ? 'rgba(74,222,128,0.2)' : A.border,
                                                                                }}>
                                                                                {value === 'true' ? 'AÇIK' : 'KAPALI'}
                                                                            </button>
                                                                        ) : type === 'select' ? (
                                                                            <select value={value} onChange={e => setProp(key, e.target.value)}
                                                                                style={{ ...fieldStyle, width: 140 }}>
                                                                                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                            </select>
                                                                        ) : (
                                                                            <input type={type === 'number' ? 'number' : 'text'} value={value}
                                                                                onChange={e => setProp(key, e.target.value)}
                                                                                style={{ ...fieldStyle, width: 140 }}
                                                                                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                                                                onBlur={e => e.target.style.borderColor = A.border}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Diğer properties */}
                                        {(() => {
                                            const knownKeys = PROPS_GROUPS.flatMap(g => g.keys.map(k => k.key));
                                            const others = Object.entries(settings.properties).filter(([k]) => !knownKeys.includes(k));
                                            if (others.length === 0) return null;
                                            return (
                                                <div>
                                                    <Cap style={{ display: 'block', marginBottom: 10 }}>Diğer</Cap>
                                                    {others.map(([key, value]) => (
                                                        <div key={key} style={{
                                                            display: 'flex', alignItems: 'center',
                                                            justifyContent: 'space-between', gap: 12,
                                                            padding: '8px 0', borderBottom: `1px solid ${A.border}`,
                                                        }}>
                                                            <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>{key}</div>
                                                            <input type="text" value={value}
                                                                onChange={e => setProp(key, e.target.value)}
                                                                style={{ ...fieldStyle, width: 180 }}
                                                            />
                                                        </div>
                                                    ))}
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
            <div style={{
                display: 'flex', gap: 8, padding: '12px 16px',
                borderTop: `1px solid ${A.border}`, flexShrink: 0, justifyContent: 'flex-end',
            }}>
                <button onClick={onClose} style={{ ...btnGhost, padding: '7px 16px' }}>İPTAL</button>
                <button onClick={handleSave} disabled={saving || isLoading || !!portError}
                    style={{
                        ...btnPrimary, padding: '7px 16px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        opacity: (saving || isLoading || !!portError) ? 0.5 : 1,
                    }}>
                    {saving ? <Spinner size={12}/> : null}
                    KAYDET
                </button>
            </div>
        </Modal>
    );
}
