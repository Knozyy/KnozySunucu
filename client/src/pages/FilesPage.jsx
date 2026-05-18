import { useState, useEffect, useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineFolder, HiOutlineDocument, HiOutlineArrowLeft,
    HiOutlineTrash, HiOutlinePencil, HiOutlineFolderPlus,
    HiOutlineDocumentPlus, HiOutlineArrowPath, HiOutlineDocumentText,
    HiOutlineMagnifyingGlass, HiOutlineCheck, HiOutlineXMark,
} from 'react-icons/hi2';

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

// ── Editör Modal ──────────────────────────────────────────────────────────────
function EditorModal({ title, filePath, content, onChange, onSave, onClose, saving, dark = false }) {
    const extensions = useMemo(() => getLanguageExt(filePath || title), [filePath, title]);
    // Escape tuşu ile kapat
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Ctrl+S ile kaydet
    useEffect(() => {
        const handler = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave(); } };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onSave]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative z-10 w-full max-w-5xl flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{ height: 'min(85vh, 800px)' }}>

                {/* Başlık çubuğu */}
                <div className={`flex items-center gap-3 px-5 py-3.5 flex-shrink-0 border-b ${dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <HiOutlinePencil className={`w-4 h-4 flex-shrink-0 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</p>
                        {filePath && filePath !== title && (
                            <p className={`text-xs font-mono truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{filePath}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Ctrl+S kaydet · Esc kapat</span>
                        <button
                            onClick={onSave}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                        >
                            <HiOutlineCheck className="w-3.5 h-3.5" />
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button
                            onClick={onClose}
                            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                        >
                            <HiOutlineXMark className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Kod editörü */}
                <div className="flex-1 overflow-auto">
                    <CodeMirror
                        value={content}
                        onChange={onChange}
                        extensions={extensions}
                        theme={dark ? oneDark : undefined}
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
    const [activeTab, setActiveTab] = useState('browser');
    const [currentPath, setCurrentPath] = useState('');
    const [editingFile, setEditingFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [showNewDialog, setShowNewDialog] = useState(null);
    // Config editörü state
    const [configSearch, setConfigSearch] = useState('');
    const [editingConfig, setEditingConfig] = useState(null);
    const [configContent, setConfigContent] = useState('');
    const queryClient = useQueryClient();

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

    // ── Config editörü ────────────────────────────────────────────────────────
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
        if (item.isDirectory) {
            setCurrentPath(item.path);
            return;
        }
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
    const { t } = useI18n();

    return (
        <div className="space-y-6">
            {/* ── Dosya Editörü Modal ── */}
            {editingFile && (
                <EditorModal
                    title={editingFile.name}
                    filePath={editingFile.path}
                    content={fileContent}
                    onChange={setFileContent}
                    onSave={handleSaveFile}
                    onClose={() => setEditingFile(null)}
                    saving={saveMutation.isPending}
                    dark={false}
                />
            )}

            {/* ── Config Editörü Modal ── */}
            {editingConfig && (
                <EditorModal
                    title={editingConfig.name}
                    filePath={editingConfig.path}
                    content={configContent}
                    onChange={setConfigContent}
                    onSave={handleSaveConfig}
                    onClose={() => setEditingConfig(null)}
                    saving={saveConfigMutation.isPending}
                    dark={true}
                />
            )}

            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('files.title')}</h1>
                    {activeTab === 'browser' && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                            <button onClick={() => setCurrentPath('')} className="hover:text-gray-900 transition-colors">root</button>
                            {pathParts.map((part, i) => (
                                <span key={i} className="flex items-center gap-1">
                                    <span>/</span>
                                    <button
                                        onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
                                        className="hover:text-gray-900 transition-colors"
                                    >{part}</button>
                                </span>
                            ))}
                        </div>
                    )}
                    {activeTab === 'configs' && (
                        <p className="text-sm text-gray-500">config/ klasöründeki tüm yapılandırma dosyaları</p>
                    )}
                </div>
                {activeTab === 'browser' && (
                    <div className="flex gap-2">
                        <button onClick={() => setShowNewDialog('file')} className="btn-secondary text-xs">
                            <HiOutlineDocumentPlus className="w-4 h-4" /> Dosya
                        </button>
                        <button onClick={() => setShowNewDialog('folder')} className="btn-secondary text-xs">
                            <HiOutlineFolderPlus className="w-4 h-4" /> Klasör
                        </button>
                        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['files'] })} className="btn-secondary text-xs">
                            <HiOutlineArrowPath className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {activeTab === 'configs' && (
                    <button onClick={() => queryClient.invalidateQueries({ queryKey: ['filePageConfigs'] })} className="btn-secondary text-xs">
                        <HiOutlineArrowPath className="w-4 h-4" /> Yenile
                    </button>
                )}
            </div>

            {/* ── Sekmeler ── */}
            <div className="flex gap-2 fade-in">
                <button onClick={() => setActiveTab('browser')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'browser' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
                    Dosya Gezgini
                </button>
                <button onClick={() => setActiveTab('configs')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'configs' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
                    Config Editörü
                </button>
            </div>

            {/* ── Config Editörü ── */}
            {activeTab === 'configs' && (
                <>
                    {/* Arama */}
                    <div className="relative fade-in">
                        <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={configSearch}
                            onChange={e => setConfigSearch(e.target.value)}
                            placeholder="Config dosyası ara... (örn: mekanism, jei, forge)"
                            className="input-field pl-11 text-sm"
                        />
                    </div>

                    <div className="glass-card overflow-hidden fade-in">
                        {loadingConfigs ? (
                            <div className="p-8 text-center text-gray-400">
                                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-3" />
                                Config dosyaları yükleniyor...
                            </div>
                        ) : filteredConfigs.length > 0 ? (
                            filteredConfigs.map(file => (
                                <button
                                    key={file.path}
                                    onClick={() => openConfig(file)}
                                    className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors text-left group"
                                >
                                    <HiOutlineDocumentText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                        <p className="text-xs text-gray-400 truncate font-mono">{file.path}</p>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(file.size, false)}</span>
                                    <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">Düzenle →</span>
                                </button>
                            ))
                        ) : (
                            <div className="p-10 text-center text-gray-400">
                                <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-medium">
                                    {configSearch ? 'Arama ile eşleşen config bulunamadı' : 'config/ klasöründe düzenlenebilir dosya bulunamadı'}
                                </p>
                                <p className="text-xs mt-1 text-gray-300">.toml · .cfg · .json · .properties · .yml · .yaml · .conf</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Dosya Gezgini ── */}
            {activeTab === 'browser' && <>

            {/* New Item Dialog */}
            {showNewDialog && (
                <div className="glass-card p-4 fade-in">
                    <div className="flex gap-3">
                        <input
                            type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)}
                            className="input-field flex-1" placeholder={showNewDialog === 'folder' ? 'Klasör adı...' : 'Dosya adı...'}
                            autoFocus onKeyDown={e => { if (e.key === 'Enter' && newItemName.trim()) createMutation.mutate({ path: currentPath ? `${currentPath}/${newItemName}` : newItemName, isDirectory: showNewDialog === 'folder' }); }}
                        />
                        <button onClick={() => { if (newItemName.trim()) createMutation.mutate({ path: currentPath ? `${currentPath}/${newItemName}` : newItemName, isDirectory: showNewDialog === 'folder' }); }} className="btn-primary text-xs">Oluştur</button>
                        <button onClick={() => { setShowNewDialog(null); setNewItemName(''); }} className="btn-secondary text-xs">İptal</button>
                    </div>
                </div>
            )}

            {/* File List */}
            <div className="glass-card overflow-hidden fade-in">
                {currentPath && (
                    <button onClick={goUp} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-gray-500">
                        <HiOutlineArrowLeft className="w-5 h-5" /> Üst Dizin
                    </button>
                )}
                {isLoading ? (
                    <div className="p-8 text-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-3" />
                        Yükleniyor...
                    </div>
                ) : data?.items?.length > 0 ? (
                    data.items.map(item => (
                        <div key={item.path} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 group">
                            <button onClick={() => openFile(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                {item.isDirectory
                                    ? <HiOutlineFolder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                    : <HiOutlineDocument className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                                <span className="text-sm text-gray-900 truncate">{item.name}</span>
                            </button>
                            <span className="text-xs text-gray-400 hidden sm:block">{formatSize(item.size, item.isDirectory)}</span>
                            <button
                                onClick={() => { if (confirm(`${item.name} silinecek. Emin misiniz?`)) deleteMutation.mutate(item.path); }}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-1"
                            >
                                <HiOutlineTrash className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-gray-400">
                        <HiOutlineFolder className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Boş klasör</p>
                    </div>
                )}
            </div>
            </>}
        </div>
    );
}
