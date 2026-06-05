import { useState, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Input } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

function formatSize(bytes, isDirectory) {
    if (isDirectory) return '-';
    if (bytes === 0 || !bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getLanguageExt(filename) {
    if (!filename) return [];
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'json') return [json()];
    if (ext === 'yml' || ext === 'yaml') return [yaml()];
    return [];
}

// ── İkon yardımcıları ─────────────────────────────────────────────────────────

function FileIcon({ size = 16, color }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color || 'currentColor'} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
    );
}

function ArrowLeftIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
        </svg>
    );
}

function RefreshIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
            <polyline points="10 9 9 9 8 9"/>
        </svg>
    );
}

// ── Editör Modal ──────────────────────────────────────────────────────────────
function EditorModal({ title, filePath, content, onChange, onSave, onClose, saving }) {
    const extensions = useMemo(() => getLanguageExt(filePath || title), [filePath, title]);

    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    useEffect(() => {
        const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave(); } };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onSave]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px 24px',
        }}>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            }}/>

            {/* Panel */}
            <div style={{
                position: 'relative', zIndex: 1,
                width: '100%', maxWidth: 1000,
                height: 'min(85vh, 800px)',
                display: 'flex', flexDirection: 'column',
                background: A.bg, border: `1px solid ${A.border}`,
                borderRadius: 4, overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}>
                {/* Başlık çubuğu */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', flexShrink: 0,
                    borderBottom: `1px solid ${A.border}`,
                    background: A.panel,
                }}>
                    <FileIcon size={14} color={A.faint}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                        </div>
                        {filePath && filePath !== title && (
                            <div style={{ fontSize: 10, fontFamily: A.mono, color: A.faint,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                {filePath}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                            Ctrl+S kaydet · Esc kapat
                        </span>
                        <button onClick={onSave} disabled={saving} style={{
                            ...btnPrimary, padding: '5px 12px', fontSize: 11,
                            display: 'flex', alignItems: 'center', gap: 5,
                            opacity: saving ? 0.6 : 1,
                        }}>
                            <I.Check size={12}/>
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button onClick={onClose} style={{
                            ...btnGhost, padding: '5px 6px',
                            display: 'flex', alignItems: 'center', color: A.faint,
                        }}>
                            <I.X size={14}/>
                        </button>
                    </div>
                </div>

                {/* Kod editörü */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <CodeMirror
                        value={content}
                        onChange={onChange}
                        extensions={extensions}
                        theme={oneDark}
                        height="100%"
                        style={{ fontSize: '13px', height: '100%' }}
                        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FilesPage() {
    const [activeTab, setActiveTab]       = useState('browser');
    const [currentPath, setCurrentPath]   = useState('');
    const [editingFile, setEditingFile]   = useState(null);
    const [fileContent, setFileContent]   = useState('');
    const [newItemName, setNewItemName]   = useState('');
    const [showNewDialog, setShowNewDialog] = useState(null);
    const [configSearch, setConfigSearch] = useState('');
    const [editingConfig, setEditingConfig] = useState(null);
    const [configContent, setConfigContent] = useState('');
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data, isLoading } = useQuery({
        queryKey: ['files', currentPath],
        queryFn: () => api.get(`/files/list?path=${encodeURIComponent(currentPath)}`).then(r => r.data),
    });

    const deleteMutation = useMutation({
        mutationFn: (filePath) => api.delete(`/files/delete?path=${encodeURIComponent(filePath)}`),
        onSuccess: () => { toast.success('Silindi'); queryClient.invalidateQueries({ queryKey: ['files'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Silinemedi'),
    });

    const createMutation = useMutation({
        mutationFn: ({ path, isDirectory }) => api.post('/files/create', { path, isDirectory }),
        onSuccess: () => {
            toast.success('Oluşturuldu');
            setShowNewDialog(null);
            setNewItemName('');
            queryClient.invalidateQueries({ queryKey: ['files'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Oluşturulamadı'),
    });

    const saveMutation = useMutation({
        mutationFn: ({ path, content }) => api.put('/files/write', { path, content }),
        onSuccess: () => { toast.success('Kaydedildi'); setEditingFile(null); },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaydedilemedi'),
    });

    const { data: configsData, isLoading: loadingConfigs } = useQuery({
        queryKey: ['filePageConfigs'],
        queryFn: () => api.get('/mods/configs').then(r => r.data),
        enabled: activeTab === 'configs',
    });

    const saveConfigMutation = useMutation({
        mutationFn: ({ path, content }) => api.put('/mods/configs/write', { path, content }),
        onSuccess: () => { toast.success('Config kaydedildi'); setEditingConfig(null); },
        onError: (err) => toast.error(err.response?.data?.error || 'Kaydedilemedi'),
    });

    const openConfig = async (file) => {
        try {
            const res = await api.get(`/mods/configs/read?path=${encodeURIComponent(file.path)}`);
            setEditingConfig(file);
            setConfigContent(res.data.content);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Dosya okunamadı');
        }
    };

    const filteredConfigs = (configsData?.files || []).filter(f =>
        !configSearch || f.path.toLowerCase().includes(configSearch.toLowerCase())
    );

    const openFile = async (item) => {
        if (item.isDirectory) { setCurrentPath(item.path); return; }
        try {
            const res = await api.get(`/files/read?path=${encodeURIComponent(item.path)}`);
            setEditingFile(item);
            setFileContent(res.data.content);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Dosya okunamadı');
        }
    };

    const goUp = () => {
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        setCurrentPath(parts.join('/'));
    };

    const handleSaveFile = useCallback(() => {
        if (editingFile) saveMutation.mutate({ path: editingFile.path, content: fileContent });
    }, [editingFile, fileContent, saveMutation]);

    const handleSaveConfig = useCallback(() => {
        if (editingConfig) saveConfigMutation.mutate({ path: editingConfig.path, content: configContent });
    }, [editingConfig, configContent, saveConfigMutation]);

    const pathParts = currentPath.split('/').filter(Boolean);

    const handleCreate = () => {
        if (!newItemName.trim()) return;
        createMutation.mutate({
            path: currentPath ? `${currentPath}/${newItemName}` : newItemName,
            isDirectory: showNewDialog === 'folder',
        });
    };

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Modaller ── */}
            {editingFile && (
                <EditorModal
                    title={editingFile.name} filePath={editingFile.path}
                    content={fileContent} onChange={setFileContent}
                    onSave={handleSaveFile} onClose={() => setEditingFile(null)}
                    saving={saveMutation.isPending}
                />
            )}
            {editingConfig && (
                <EditorModal
                    title={editingConfig.name} filePath={editingConfig.path}
                    content={configContent} onChange={setConfigContent}
                    onSave={handleSaveConfig} onClose={() => setEditingConfig(null)}
                    saving={saveConfigMutation.isPending}
                />
            )}

            {/* ── Başlık + Araçlar ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>dosyalar</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                        margin: '4px 0 4px', letterSpacing: '-0.01em' }}>
                        {t('files.title')}
                    </h1>
                    {activeTab === 'browser' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                            <button onClick={() => setCurrentPath('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: A.dim, padding: 0, fontFamily: A.mono, fontSize: 11 }}>
                                root
                            </button>
                            {pathParts.map((part, i) => (
                                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ color: A.border }}>/</span>
                                    <button
                                        onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                                            color: i === pathParts.length - 1 ? A.text : A.dim,
                                            padding: 0, fontFamily: A.mono, fontSize: 11 }}>
                                        {part}
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    {activeTab === 'configs' && (
                        <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                            config/ klasöründeki tüm yapılandırma dosyaları
                        </p>
                    )}
                </div>

                {/* Sağ araç çubuğu */}
                {activeTab === 'browser' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setShowNewDialog('file')} style={{
                            ...btnGhost, padding: '6px 12px', fontSize: 11,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <FileIcon size={13}/> Dosya
                        </button>
                        <button onClick={() => setShowNewDialog('folder')} style={{
                            ...btnGhost, padding: '6px 12px', fontSize: 11,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <I.Folder size={13}/> Klasör
                        </button>
                        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['files'] })} style={{
                            ...btnGhost, padding: '6px 8px',
                            display: 'flex', alignItems: 'center', color: A.faint,
                        }}>
                            <RefreshIcon size={13}/>
                        </button>
                    </div>
                )}
                {activeTab === 'configs' && (
                    <button onClick={() => queryClient.invalidateQueries({ queryKey: ['filePageConfigs'] })} style={{
                        ...btnGhost, padding: '6px 12px', fontSize: 11,
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    }}>
                        <RefreshIcon size={13}/> Yenile
                    </button>
                )}
            </div>

            {/* ── Sekmeler ── */}
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${A.border}` }}>
                {[
                    { id: 'browser', label: 'Dosya Gezgini' },
                    { id: 'configs', label: 'Config Editörü' },
                ].map(tab => (
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

            {/* ── Config Editörü ── */}
            {activeTab === 'configs' && (
                <>
                    <div style={{ position: 'relative' }}>
                        <span style={{
                            position: 'absolute', left: 10, top: '50%',
                            transform: 'translateY(-50%)', color: A.faint, display: 'flex',
                        }}>
                            <I.Search size={13}/>
                        </span>
                        <Input value={configSearch} onChange={e => setConfigSearch(e.target.value)}
                            placeholder="Config dosyası ara... (örn: mekanism, jei, forge)" mono
                            style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}/>
                    </div>

                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        {loadingConfigs ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                <div style={{
                                    width: 20, height: 20, margin: '0 auto 10px',
                                    border: `2px solid ${A.border}`, borderTopColor: 'var(--accent)',
                                    borderRadius: '50%', animation: 'hoodoo-spin 0.8s linear infinite',
                                }}/>
                                <p style={{ fontSize: 12, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                    Config dosyaları yükleniyor...
                                </p>
                            </div>
                        ) : filteredConfigs.length > 0 ? (
                            filteredConfigs.map((file, i) => (
                                <button key={file.path} onClick={() => openConfig(file)} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                                    background: 'none', border: 'none',
                                    borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = A.bgDeeper}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                    <DocTextIcon size={16} style={{ color: '#60a5fa', flexShrink: 0 }}/>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: A.text,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {file.name}
                                        </div>
                                        <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 1,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {file.path}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, flexShrink: 0 }}>
                                        {formatSize(file.size, false)}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: A.mono, flexShrink: 0 }}>
                                        düzenle →
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                                <DocTextIcon size={32} style={{ color: A.faint, margin: '0 auto 10px', display: 'block', opacity: 0.3 }}/>
                                <p style={{ fontSize: 12, color: A.dim, margin: '0 0 4px' }}>
                                    {configSearch ? 'Arama ile eşleşen config bulunamadı' : 'config/ klasöründe düzenlenebilir dosya bulunamadı'}
                                </p>
                                <p style={{ fontSize: 10, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                    .toml · .cfg · .json · .properties · .yml · .yaml · .conf
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Dosya Gezgini ── */}
            {activeTab === 'browser' && (
                <>
                    {/* Yeni öğe diyaloğu */}
                    {showNewDialog && (
                        <div style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '12px 16px',
                        }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Input
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    placeholder={showNewDialog === 'folder' ? 'Klasör adı...' : 'Dosya adı...'}
                                    mono autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                                    style={{ flex: 1 }}
                                />
                                <button onClick={handleCreate} style={{
                                    ...btnPrimary, padding: '0 14px', fontSize: 11,
                                }}>
                                    Oluştur
                                </button>
                                <button onClick={() => { setShowNewDialog(null); setNewItemName(''); }} style={{
                                    ...btnGhost, padding: '0 12px', fontSize: 11,
                                }}>
                                    İptal
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Dosya listesi */}
                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        {currentPath && (
                            <button onClick={goUp} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 16px', background: 'none', border: 'none',
                                borderBottom: `1px solid ${A.border}`,
                                cursor: 'pointer', color: A.dim, transition: 'background 0.1s',
                                fontSize: 12, fontFamily: A.mono,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = A.bgDeeper}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                <ArrowLeftIcon size={14}/> Üst Dizin
                            </button>
                        )}

                        {isLoading ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                <div style={{
                                    width: 20, height: 20, margin: '0 auto 10px',
                                    border: `2px solid ${A.border}`, borderTopColor: 'var(--accent)',
                                    borderRadius: '50%', animation: 'hoodoo-spin 0.8s linear infinite',
                                }}/>
                                <p style={{ fontSize: 12, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                    Yükleniyor...
                                </p>
                            </div>
                        ) : data?.items?.length > 0 ? (
                            data.items.map((item, i) => (
                                <div key={item.path} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 16px',
                                    borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = A.bgDeeper}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                    <button onClick={() => openFile(item)} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        flex: 1, minWidth: 0, textAlign: 'left',
                                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    }}>
                                        {item.isDirectory
                                            ? <I.Folder size={16} style={{ color: '#fbbf24', flexShrink: 0 }}/>
                                            : <FileIcon size={16} color={A.faint}/>
                                        }
                                        <span style={{ fontSize: 13, color: A.text,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.name}
                                        </span>
                                    </button>
                                    <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, flexShrink: 0 }}>
                                        {formatSize(item.size, item.isDirectory)}
                                    </span>
                                    <button
                                        onClick={() => { if (confirm(`${item.name} silinecek. Emin misiniz?`)) deleteMutation.mutate(item.path); }}
                                        style={{
                                            ...btnGhost, padding: '3px 5px', color: A.err,
                                            borderColor: 'rgba(248,113,113,0.2)',
                                            display: 'flex', alignItems: 'center', flexShrink: 0,
                                        }}>
                                        <I.Trash size={13}/>
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                                <I.Folder size={36} style={{ color: A.faint, margin: '0 auto 10px', display: 'block', opacity: 0.3 }}/>
                                <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>Boş klasör</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
