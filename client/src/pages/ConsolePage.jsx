import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useI18n } from '@/context/I18nContext';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineCommandLine, HiOutlineSignal, HiOutlineTrash,
    HiOutlinePaperAirplane, HiOutlineDocumentText,
    HiOutlineMagnifyingGlass, HiOutlineFunnel,
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

            {activeTab === 'console' ? (
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

