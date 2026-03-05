import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineFolder, HiOutlineDocument, HiOutlineArrowLeft,
    HiOutlineTrash, HiOutlinePencil, HiOutlineFolderPlus,
    HiOutlineDocumentPlus, HiOutlineArrowPath,
} from 'react-icons/hi2';

function formatSize(bytes, isDirectory) {
    if (isDirectory) return '-';
    if (bytes === 0 || !bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesPage() {
    const [currentPath, setCurrentPath] = useState('');
    const [editingFile, setEditingFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [showNewDialog, setShowNewDialog] = useState(null);
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

    const openFile = async (item) => {
        if (item.isDirectory) {
            setCurrentPath(item.path);
            setEditingFile(null);
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
        setEditingFile(null);
    };

    const pathParts = currentPath.split('/').filter(Boolean);

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('files.title')}</h1>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                        <button onClick={() => { setCurrentPath(''); setEditingFile(null); }} className="hover:text-gray-900 transition-colors">root</button>
                        {pathParts.map((part, i) => (
                            <span key={i} className="flex items-center gap-1">
                                <span>/</span>
                                <button
                                    onClick={() => { setCurrentPath(pathParts.slice(0, i + 1).join('/')); setEditingFile(null); }}
                                    className="hover:text-gray-900 transition-colors"
                                >{part}</button>
                            </span>
                        ))}
                    </div>
                </div>
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
            </div>

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

            {/* File Editor */}
            {editingFile && (
                <div className="glass-card p-4 fade-in">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <HiOutlinePencil className="w-4 h-4" /> {editingFile.name}
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={() => saveMutation.mutate({ path: editingFile.path, content: fileContent })} disabled={saveMutation.isPending} className="btn-primary text-xs">
                                {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                            <button onClick={() => setEditingFile(null)} className="btn-secondary text-xs">Kapat</button>
                        </div>
                    </div>
                    <textarea
                        value={fileContent} onChange={e => setFileContent(e.target.value)}
                        className="w-full h-96 font-mono text-sm p-4 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                        spellCheck={false}
                    />
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
        </div>
    );
}
