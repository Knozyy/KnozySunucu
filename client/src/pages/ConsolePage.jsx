import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineCommandLine, HiOutlineSignal, HiOutlineTrash,
    HiOutlinePaperAirplane, HiOutlineDocumentText,
    HiOutlineMagnifyingGlass, HiOutlineFunnel,
    HiOutlineRectangleGroup, HiOutlinePlus, HiOutlinePencil,
    HiOutlinePlay, HiOutlineXMark, HiOutlineArchiveBox,
} from 'react-icons/hi2';

export default function ConsolePage() {
    const { token } = useAuth();
    const { logs, status, connected, sendCommand, clearLogs } = useWebSocket(token);
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState('console');
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const logsEndRef = useRef(null);

    useEffect(() => {
        if (activeTab === 'console') logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs, activeTab]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!command.trim()) return;
        sendCommand(command.trim());
        setCommandHistory(prev => [command.trim(), ...prev.slice(0, 49)]);
        setCommand('');
        setHistoryIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
            setHistoryIndex(newIndex);
            setCommand(commandHistory[newIndex] || '');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = Math.max(historyIndex - 1, -1);
            setHistoryIndex(newIndex);
            setCommand(newIndex === -1 ? '' : commandHistory[newIndex]);
        }
    };

    const getLogColor = (line) => {
        if (line.startsWith('>')) return 'text-blue-600';
        if (line.includes('[STDERR]') || line.includes('ERROR') || line.includes('FATAL')) return 'text-red-500';
        if (line.includes('WARN')) return 'text-amber-600';
        if (line.includes('[System]')) return 'text-blue-500';
        return 'text-gray-600';
    };

    const tabs = [
        { id: 'console', label: 'Konsol', icon: HiOutlineCommandLine },
        { id: 'macros', label: 'Makrolar', icon: HiOutlineRectangleGroup },
        { id: 'archive', label: 'Arşiv Arama', icon: HiOutlineArchiveBox },
        { id: 'logs', label: 'Log Dosyaları', icon: HiOutlineDocumentText },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('console.title')}</h1>
                    <p className="text-gray-500">{t('console.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-2 text-sm ${connected ? 'text-green-600' : 'text-red-500'}`}>
                        <HiOutlineSignal className="w-4 h-4" />
                        {connected ? t('console.connected') : t('console.disconnected')}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 fade-in">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}>
                        <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'macros' ? (
                <MacrosPanel mcStatus={status?.status} sendCommand={sendCommand} />
            ) : activeTab === 'archive' ? (
                <LogArchivePanel />
            ) : activeTab === 'console' ? (
                <div className="glass-card overflow-hidden fade-in">
                    {/* Terminal header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-amber-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                            <span className="ml-2 text-xs text-gray-400 font-mono">minecraft-server-console</span>
                        </div>
                        <button onClick={clearLogs} className="btn-secondary text-xs py-1.5 px-3">
                            <HiOutlineTrash className="w-4 h-4" /> {t('console.clear')}
                        </button>
                    </div>

                    {/* Terminal body */}
                    <div className="h-[500px] overflow-y-auto p-4 font-mono text-sm bg-gray-900" style={{ fontFamily: "var(--font-family-mono)" }}>
                        {logs.length === 0 ? (
                            <div className="text-gray-500 text-center py-16">
                                <HiOutlineCommandLine className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>Konsol çıktısı burada görünecek...</p>
                                <p className="text-xs mt-1">Sunucuyu başlattıktan sonra loglar burada akmaya başlar</p>
                            </div>
                        ) : (
                            logs.map((line, index) => (
                                <div key={index} className={`leading-6 hover:bg-white/5 px-2 -mx-2 rounded ${getLogColor(line)}`}>
                                    {line}
                                </div>
                            ))
                        )}
                        <div ref={logsEndRef} />
                    </div>

                    {/* Command input */}
                    <form onSubmit={handleSubmit} className="flex border-t border-gray-200">
                        <span className="flex items-center px-4 text-gray-900 font-mono text-sm bg-gray-50">&gt;</span>
                        <input
                            type="text" value={command}
                            onChange={e => setCommand(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1 bg-white border-none outline-none px-2 py-3 text-gray-900 font-mono text-sm placeholder:text-gray-400"
                            placeholder="Komut girin... (örn: I agree, list, op player)"
                            disabled={!connected || (status?.status !== 'running' && status?.status !== 'starting')}
                        />
                        <button type="submit" disabled={!command.trim() || !connected}
                            className="px-4 text-gray-900 hover:text-gray-600 transition-colors disabled:text-gray-300">
                            <HiOutlinePaperAirplane className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            ) : (
                <LogFilesPanel />
            )}

        </div>
    );
}

// ============================================================
// LOG DOSYALARI PANELİ (eski LogsPage)
// ============================================================
function LogFilesPanel() {
    const [selectedFile, setSelectedFile] = useState('latest.log');
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('all');

    const { data: logFiles } = useQuery({
        queryKey: ['logFiles'],
        queryFn: () => api.get('/logs/files').then(r => r.data),
    });

    const { data: logContent, isLoading } = useQuery({
        queryKey: ['logContent', selectedFile],
        queryFn: () => api.get(`/logs/file/${encodeURIComponent(selectedFile)}`).then(r => r.data),
        enabled: !!selectedFile,
    });

    const allLines = (logContent?.content || '').split('\n').filter(l => l.trim());

    const lines = allLines.filter(line => {
        if (levelFilter !== 'all') {
            const lower = line.toLowerCase();
            if (levelFilter === 'error' && !lower.includes('error') && !lower.includes('fatal')) return false;
            if (levelFilter === 'warn' && !lower.includes('warn')) return false;
            if (levelFilter === 'info' && !lower.includes('info')) return false;
        }
        if (search && !line.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const getLineColor = (line) => {
        const l = line.toLowerCase();
        if (l.includes('error') || l.includes('fatal')) return 'text-red-400';
        if (l.includes('warn')) return 'text-amber-400';
        if (l.includes('info')) return 'text-blue-400';
        return 'text-gray-400';
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
                <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)}
                    className="input-field text-sm flex-1">
                    {logFiles?.files?.map(f => <option key={f.name} value={f.name}>{f.name} ({(f.size / 1024).toFixed(0)} KB)</option>)}
                </select>
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1 sm:w-48">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            className="input-field text-sm pl-9 w-full" placeholder="Ara..." />
                    </div>
                    <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
                        className="input-field text-sm w-28">
                        <option value="all">Tümü</option>
                        <option value="error">Error</option>
                        <option value="warn">Warn</option>
                        <option value="info">Info</option>
                    </select>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs text-gray-500 font-mono">{selectedFile}</span>
                    <span className="text-xs text-gray-400">{lines.length} satır</span>
                </div>
                <div className="h-[500px] overflow-y-auto p-4 font-mono text-xs bg-gray-900">
                    {isLoading ? (
                        <div className="text-gray-500 text-center py-16">Yükleniyor...</div>
                    ) : lines.length === 0 ? (
                        <div className="text-gray-500 text-center py-16">
                            <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>Log bulunamadı</p>
                        </div>
                    ) : (
                        lines.map((line, i) => (
                            <div key={i} className={`leading-5 hover:bg-white/5 px-2 -mx-2 rounded ${getLineColor(line)}`}>
                                {line}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// LOG ARŞİV ARAMA PANELİ
// ============================================================

function LogArchivePanel() {
    const [query, setQuery] = useState('');
    const [level, setLevel] = useState('all');
    const [submitted, setSubmitted] = useState('');

    const { data, isFetching } = useQuery({
        queryKey: ['log-search-all', submitted, level],
        queryFn: () => submitted
            ? api.get(`/logs/search-all?q=${encodeURIComponent(submitted)}&level=${level}`).then(r => r.data)
            : null,
        enabled: !!submitted,
    });

    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim()) setSubmitted(query.trim());
    };

    const getLineColor = (line) => {
        const l = line.toLowerCase();
        if (l.includes('error') || l.includes('fatal')) return 'text-red-400';
        if (l.includes('warn')) return 'text-amber-400';
        return 'text-gray-400';
    };

    return (
        <div className="space-y-4 fade-in">
            <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                    <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Tüm loglarda ara... (örn: ERROR, Player, uuid)"
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <select value={level} onChange={e => setLevel(e.target.value)}
                    className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                    <option value="all">Tümü</option>
                    <option value="error">Error</option>
                    <option value="warn">Warn</option>
                    <option value="info">Info</option>
                </select>
                <button type="submit" disabled={!query.trim()}
                    className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-40">
                    Ara
                </button>
            </form>

            {isFetching && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Tüm log dosyaları taranıyor...
                </div>
            )}

            {data && !isFetching && (
                <>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                        <span>{data.total} sonuç</span>
                        <span>•</span>
                        <span>{data.filesSearched} dosya tarandı</span>
                        <span>•</span>
                        <span>{(data.scanned || 0).toLocaleString()} satır</span>
                    </div>
                    <div className="glass-card overflow-hidden">
                        <div className="h-[500px] overflow-y-auto p-4 font-mono text-xs bg-gray-900">
                            {data.results.length === 0 ? (
                                <div className="text-gray-500 text-center py-16">
                                    <HiOutlineArchiveBox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p>Sonuç bulunamadı.</p>
                                </div>
                            ) : (
                                data.results.map((r, i) => (
                                    <div key={i} className="leading-5 hover:bg-white/5 px-2 -mx-2 rounded flex gap-2">
                                        <span className="text-indigo-400/60 flex-shrink-0 w-28 truncate">{r.file}:{r.lineNumber}</span>
                                        <span className={getLineColor(r.content)}>{r.content}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {!data && !isFetching && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-10 text-center">
                    <HiOutlineArchiveBox className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tüm log dosyalarında (latest.log + arşiv .gz) arama yapın.</p>
                </div>
            )}
        </div>
    );
}

// ============================================================
// MAKROLAR PANELİ
// ============================================================

const MACRO_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
    '#64748b', '#1e293b',
];

function MacroModal({ initial, onClose, onSave }) {
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [commandsText, setCommandsText] = useState((initial?.commands ?? []).join('\n'));
    const [color, setColor] = useState(initial?.color ?? '#6366f1');

    const handleSave = () => {
        if (!name.trim()) { toast.error('İsim gerekli'); return; }
        const commands = commandsText.split('\n').map(c => c.trim()).filter(Boolean);
        if (commands.length === 0) { toast.error('En az bir komut girin'); return; }
        onSave({ name: name.trim(), description: description.trim(), commands, color });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        {initial ? 'Makroyu Düzenle' : 'Yeni Makro'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">İsim</label>
                        <input
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={name} onChange={e => setName(e.target.value)} placeholder="örn: Dünya Kaydet"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Açıklama (opsiyonel)</label>
                        <input
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={description} onChange={e => setDescription(e.target.value)} placeholder="Ne yapıyor?"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Komutlar <span className="text-gray-400">(her satır bir komut)</span>
                        </label>
                        <textarea
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={5} value={commandsText} onChange={e => setCommandsText(e.target.value)}
                            placeholder={"save-all\nsay Sunucu kaydedildi!"}
                        />
                        <p className="text-xs text-gray-400 mt-1">{commandsText.split('\n').filter(c => c.trim()).length} komut • aralarında 500ms bekleme</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Renk</label>
                        <div className="flex flex-wrap gap-2">
                            {MACRO_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={`w-7 h-7 rounded-lg transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 p-5 border-t border-gray-100 dark:border-gray-800">
                    <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                        İptal
                    </button>
                    <button onClick={handleSave} className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90">
                        Kaydet
                    </button>
                </div>
            </div>
        </div>
    );
}

function MacrosPanel({ mcStatus, sendCommand }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const qc = useQueryClient();
    const [modal, setModal] = useState(null);
    const [executing, setExecuting] = useState(null);

    const { data: macros = [], isLoading } = useQuery({
        queryKey: ['macros'],
        queryFn: () => api.get('/macros').then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (body) => api.post('/macros', body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['macros'] }); setModal(null); toast.success('Makro oluşturuldu'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, ...body }) => api.put(`/macros/${id}`, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['macros'] }); setModal(null); toast.success('Makro güncellendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/macros/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['macros'] }); toast.success('Makro silindi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const executeMacro = async (macro) => {
        if (mcStatus !== 'running') { toast.error('Sunucu çalışmıyor'); return; }
        setExecuting(macro.id);
        try {
            await api.post(`/macros/${macro.id}/execute`);
            toast.success(`"${macro.name}" çalıştırıldı (${macro.commands.length} komut)`);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Çalıştırılamadı');
        } finally {
            setExecuting(null);
        }
    };

    const handleSave = (data) => {
        if (modal?.id) updateMutation.mutate({ id: modal.id, ...data });
        else createMutation.mutate(data);
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">Sık kullanılan komutları tek tıkla çalıştırın.</p>
                {isAdmin && (
                    <button onClick={() => setModal('new')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity">
                        <HiOutlinePlus className="w-4 h-4" /> Yeni Makro
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                </div>
            ) : macros.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-10 text-center">
                    <HiOutlineRectangleGroup className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Henüz makro yok.</p>
                    {isAdmin && <p className="text-xs text-gray-400 mt-1">Sağ üstten yeni makro oluşturabilirsiniz.</p>}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {macros.map(macro => (
                        <div key={macro.id}
                            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: macro.color }} />
                                    <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{macro.name}</span>
                                </div>
                                {isAdmin && (
                                    <div className="flex gap-1 flex-shrink-0">
                                        <button onClick={() => setModal(macro)}
                                            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                            <HiOutlinePencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => { if (window.confirm(`"${macro.name}" silinsin mi?`)) deleteMutation.mutate(macro.id); }}
                                            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                                            <HiOutlineTrash className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {macro.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">{macro.description}</p>
                            )}

                            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5 font-mono text-xs space-y-0.5">
                                {macro.commands.slice(0, 4).map((cmd, i) => (
                                    <div key={i} className="text-gray-600 dark:text-gray-300 truncate">
                                        <span className="text-gray-400 dark:text-gray-500 mr-1">&gt;</span>{cmd}
                                    </div>
                                ))}
                                {macro.commands.length > 4 && (
                                    <div className="text-gray-400 dark:text-gray-500 text-xs">+{macro.commands.length - 4} daha...</div>
                                )}
                            </div>

                            <button
                                onClick={() => executeMacro(macro)}
                                disabled={mcStatus !== 'running' || executing === macro.id}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
                                style={{ background: macro.color }}
                            >
                                {executing === macro.id ? (
                                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <HiOutlinePlay className="w-4 h-4" />
                                )}
                                {executing === macro.id ? 'Çalışıyor...' : 'Çalıştır'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {modal && (
                <MacroModal
                    initial={modal === 'new' ? null : modal}
                    onClose={() => setModal(null)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
