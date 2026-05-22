import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useI18n } from '@/context/I18nContext';
import { formatBytes } from '@/utils/formatters';
import {
    HiOutlineDocumentText, HiOutlineArrowPath, HiOutlineMagnifyingGlass,
    HiOutlineFunnel, HiOutlineArrowDown, HiOutlineExclamationTriangle,
    HiOutlineChevronDown, HiOutlineChevronRight,
} from 'react-icons/hi2';

const LOG_LEVELS = {
    ALL: { label: 'Tümü', color: '' },
    ERROR: { label: 'Hata', color: 'text-red-400' },
    WARN: { label: 'Uyarı', color: 'text-amber-400' },
    INFO: { label: 'Bilgi', color: 'text-blue-400' },
};

function getLineColor(line) {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('exception') || lower.includes('fatal')) return 'text-red-400 bg-red-900/10';
    if (lower.includes('warn')) return 'text-amber-400 bg-amber-900/10';
    if (lower.includes('[stderr]')) return 'text-red-300';
    if (lower.includes('[system]') || line.startsWith('>')) return 'text-cyan-400';
    return 'text-gray-300';
}

export default function LogsPage() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState('ALL');
    const [autoScroll, setAutoScroll] = useState(true);
    const [showCrashReports, setShowCrashReports] = useState(false);
    const [selectedCrash, setSelectedCrash] = useState(null);
    const [expandedCrash, setExpandedCrash] = useState(null);
    const logEndRef = useRef(null);
    const logContainerRef = useRef(null);
    const { t } = useI18n();

    const { data: filesData, isLoading: loadingFiles } = useQuery({
        queryKey: ['logFiles'],
        queryFn: () => api.get('/logs/files').then(r => r.data),
        refetchInterval: autoRefresh ? 10000 : false,
    });

    const { data: latestLog, refetch: refetchLatest } = useQuery({
        queryKey: ['latestLog'],
        queryFn: () => api.get('/logs/latest?lines=500').then(r => r.data),
        enabled: !selectedFile,
        refetchInterval: autoRefresh && !selectedFile ? 3000 : false,
    });

    const { data: fileContent } = useQuery({
        queryKey: ['logFile', selectedFile],
        queryFn: () => api.get(`/logs/file/${selectedFile}`).then(r => r.data),
        enabled: !!selectedFile,
    });

    const { data: crashReportsData } = useQuery({
        queryKey: ['crashReports'],
        queryFn: () => api.get('/logs/crash-reports').then(r => r.data),
        enabled: showCrashReports,
        refetchInterval: showCrashReports ? 30000 : false,
    });

    const { data: crashFileData } = useQuery({
        queryKey: ['crashFile', selectedCrash],
        queryFn: () => api.get(`/logs/crash-reports/${selectedCrash}`).then(r => r.data),
        enabled: !!selectedCrash,
    });

    const logContent = selectedFile ? fileContent?.content : latestLog?.content;

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logContent, autoScroll]);

    // Scroll event: kullanıcı yukarı scroll yaparsa auto-scroll kapat
    const handleScroll = useCallback(() => {
        if (!logContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isAtBottom);
    }, []);

    // Filtreleme
    const filteredLines = (logContent || '').split('\n').filter(line => {
        if (!line.trim()) return false;
        if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (levelFilter !== 'ALL') {
            const lower = line.toLowerCase();
            if (levelFilter === 'ERROR' && !lower.includes('error') && !lower.includes('exception') && !lower.includes('fatal')) return false;
            if (levelFilter === 'WARN' && !lower.includes('warn')) return false;
            if (levelFilter === 'INFO' && !lower.includes('info')) return false;
        }
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('nav.logs')}</h1>
                    <p className="text-gray-500">Sunucu log dosyalarını görüntüle</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${autoRefresh
                            ? 'bg-green-50 text-green-600 border border-green-200'
                            : 'bg-gray-50 text-gray-400 border border-gray-200'
                            }`}
                    >
                        {autoRefresh ? '🟢 Canlı' : '⚫ Durdur'}
                    </button>
                    <button onClick={() => { setSelectedFile(null); refetchLatest(); }} className="btn-secondary">
                        <HiOutlineArrowPath className="w-5 h-5" /> Yenile
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sol Panel: Dosya Listesi */}
                <div className="glass-card p-4 fade-in">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 px-2">Log Dosyaları</h3>
                    <button
                        onClick={() => { setShowCrashReports(false); setSelectedFile(null); }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all mb-1 ${!selectedFile && !showCrashReports ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        📋 latest.log {!selectedFile && !showCrashReports && autoRefresh && <span className="text-xs opacity-60">(canlı)</span>}
                    </button>
                    {loadingFiles ? (
                        <div className="space-y-2 mt-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 w-full" />)}</div>
                    ) : (
                        <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                            {filesData?.files?.map((file) => (
                                <button
                                    key={file.name}
                                    onClick={() => { setShowCrashReports(false); setSelectedFile(file.name); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${selectedFile === file.name && !showCrashReports ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className="truncate block">
                                        {file.isCompressed ? '📦 ' : '📄 '}{file.name}
                                    </span>
                                    <span className="text-xs opacity-60">{formatBytes(file.size)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Crash Reports Bölümü */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                        <button
                            onClick={() => { setShowCrashReports(true); setSelectedFile(null); setSelectedCrash(null); }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2 ${showCrashReports ? 'bg-red-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                        >
                            <HiOutlineExclamationTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>Crash Raporları</span>
                            {crashReportsData?.reports?.length > 0 && (
                                <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${showCrashReports ? 'bg-red-700' : 'bg-red-100 text-red-600'}`}>
                                    {crashReportsData.reports.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Sağ Panel */}
                <div className="lg:col-span-3 glass-card overflow-hidden fade-in">
                    {showCrashReports ? (
                        /* ── Crash Reports Görünümü ── */
                        <>
                            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-100">
                                <HiOutlineExclamationTriangle className="w-4 h-4 text-red-500" />
                                <span className="text-sm font-medium text-red-700">Crash Raporları</span>
                                <div className="flex-1" />
                                {selectedCrash && (
                                    <button onClick={() => setSelectedCrash(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded bg-white border border-gray-200">
                                        ← Listeye Dön
                                    </button>
                                )}
                            </div>

                            {selectedCrash ? (
                                /* Crash dosyası tam içeriği */
                                <div className="h-[600px] overflow-y-auto p-4 font-mono text-xs bg-gray-900 whitespace-pre-wrap text-gray-300"
                                    style={{ fontFamily: 'var(--font-family-mono)' }}>
                                    {crashFileData?.content
                                        ? crashFileData.content.split('\n').map((line, i) => (
                                            <div key={i} className={`leading-5 ${line.includes('java.lang.') || line.includes('Exception') ? 'text-red-400' : line.startsWith('\t') ? 'text-gray-500' : 'text-gray-300'}`}>
                                                {line}
                                            </div>
                                        ))
                                        : <div className="text-gray-500 py-8 text-center">Yükleniyor...</div>
                                    }
                                </div>
                            ) : (
                                /* Crash listesi */
                                <div className="h-[600px] overflow-y-auto">
                                    {!crashReportsData?.reports?.length ? (
                                        <div className="text-center text-gray-400 py-16">
                                            <HiOutlineExclamationTriangle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p className="text-sm">Crash raporu bulunamadı</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {crashReportsData.reports.map((report) => (
                                                <div key={report.filename} className="p-4 hover:bg-gray-50">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-mono text-gray-500 truncate">{report.filename}</span>
                                                                <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(report.size)}</span>
                                                            </div>
                                                            {report.description && (
                                                                <p className="text-sm text-red-600 font-medium truncate">{report.description}</p>
                                                            )}
                                                            <button
                                                                onClick={() => setExpandedCrash(expandedCrash === report.filename ? null : report.filename)}
                                                                className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                                                            >
                                                                {expandedCrash === report.filename
                                                                    ? <HiOutlineChevronDown className="w-3 h-3" />
                                                                    : <HiOutlineChevronRight className="w-3 h-3" />}
                                                                Özet göster
                                                            </button>
                                                            {expandedCrash === report.filename && report.excerpt && (
                                                                <pre className="mt-2 text-xs bg-gray-900 text-red-300 rounded p-2 overflow-x-auto whitespace-pre-wrap">{report.excerpt}</pre>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedCrash(report.filename)}
                                                            className="flex-shrink-0 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all"
                                                        >
                                                            Tam Rapor
                                                        </button>
                                                    </div>
                                                    <div className="mt-1 text-xs text-gray-400">
                                                        {new Date(report.modified).toLocaleString('tr-TR')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
                                {selectedCrash ? selectedCrash : `${crashReportsData?.reports?.length || 0} crash raporu`}
                            </div>
                        </>
                    ) : (
                        /* ── Log Görünümü ── */
                        <>
                            {/* Üst Bar */}
                            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 flex-wrap">
                                <HiOutlineDocumentText className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-500 font-mono">{selectedFile || 'latest.log'}</span>

                                <div className="flex-1" />

                                {/* Seviye Filtresi */}
                                <div className="flex gap-1">
                                    {Object.entries(LOG_LEVELS).map(([key, val]) => (
                                        <button
                                            key={key}
                                            onClick={() => setLevelFilter(key)}
                                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${levelFilter === key
                                                ? 'bg-gray-900 text-white'
                                                : 'bg-gray-100 text-gray-400 hover:text-gray-600'
                                                }`}
                                        >
                                            {val.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Arama */}
                                <div className="relative">
                                    <HiOutlineMagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="pl-7 pr-3 py-1 text-xs border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-1 focus:ring-gray-300"
                                        placeholder="Log ara..."
                                    />
                                </div>
                            </div>

                            {/* Log İçerik */}
                            <div
                                ref={logContainerRef}
                                onScroll={handleScroll}
                                className="h-[600px] overflow-y-auto p-4 font-mono text-xs bg-gray-900 whitespace-pre-wrap"
                                style={{ fontFamily: "var(--font-family-mono)" }}
                            >
                                {filteredLines.length > 0 ? (
                                    <>
                                        {filteredLines.map((line, i) => (
                                            <div key={i} className={`leading-5 hover:bg-white/5 px-2 -mx-2 rounded ${getLineColor(line)}`}>
                                                <span className="text-gray-600 select-none mr-3">{String(i + 1).padStart(4)}</span>
                                                {searchQuery ? highlightMatch(line, searchQuery) : line}
                                            </div>
                                        ))}
                                        <div ref={logEndRef} />
                                    </>
                                ) : (
                                    <div className="text-center text-gray-500 py-16">
                                        <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p>{searchQuery ? 'Aramanızla eşleşen log bulunamadı' : 'Log dosyası bulunamadı veya boş'}</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer: Bilgi */}
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
                                <span>{filteredLines.length} satır gösteriliyor</span>
                                <div className="flex items-center gap-2">
                                    {!autoScroll && (
                                        <button
                                            onClick={() => { setAutoScroll(true); logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                                        >
                                            <HiOutlineArrowDown className="w-3.5 h-3.5" /> En alta git
                                        </button>
                                    )}
                                    {latestLog?.totalLines && <span>Toplam: {latestLog.totalLines} satır</span>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function highlightMatch(text, query) {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return text;

    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}
