import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { useI18n } from '@/context/I18nContext';
import { formatBytes } from '@/utils/formatters';
import { HiOutlineDocumentText, HiOutlineArrowPath } from 'react-icons/hi2';

export default function LogsPage() {
    const [selectedFile, setSelectedFile] = useState(null);

    const { data: filesData, isLoading: loadingFiles } = useQuery({
        queryKey: ['logFiles'],
        queryFn: () => api.get('/logs/files').then(r => r.data),
    });

    const { data: latestLog, refetch: refetchLatest } = useQuery({
        queryKey: ['latestLog'],
        queryFn: () => api.get('/logs/latest?lines=300').then(r => r.data),
        enabled: !selectedFile,
    });

    const { data: fileContent } = useQuery({
        queryKey: ['logFile', selectedFile],
        queryFn: () => api.get(`/logs/file/${selectedFile}`).then(r => r.data),
        enabled: !!selectedFile,
    });

    const logContent = selectedFile ? fileContent?.content : latestLog?.content;

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('nav.logs')}</h1>
                    <p className="text-gray-500">Sunucu log dosyalarını görüntüle</p>
                </div>
                <button onClick={() => { setSelectedFile(null); refetchLatest(); }} className="btn-secondary">
                    <HiOutlineArrowPath className="w-5 h-5" /> Yenile
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="glass-card p-4 fade-in">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 px-2">Log Dosyaları</h3>
                    <button
                        onClick={() => setSelectedFile(null)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all mb-1 ${!selectedFile ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                    >
                        📋 latest.log
                    </button>
                    {loadingFiles ? (
                        <div className="space-y-2 mt-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 w-full" />)}</div>
                    ) : (
                        <div className="space-y-1 mt-1 max-h-64 overflow-y-auto">
                            {filesData?.files?.map((file) => (
                                <button
                                    key={file.name}
                                    onClick={() => setSelectedFile(file.name)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${selectedFile === file.name ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className="truncate block">{file.name}</span>
                                    <span className="text-xs opacity-60">{formatBytes(file.size)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-3 glass-card overflow-hidden fade-in">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <HiOutlineDocumentText className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500 font-mono">{selectedFile || 'latest.log'}</span>
                    </div>
                    <div className="h-[600px] overflow-y-auto p-4 font-mono text-xs bg-gray-900 whitespace-pre-wrap text-gray-300" style={{ fontFamily: "var(--font-family-mono)" }}>
                        {logContent ? (
                            logContent.split('\n').map((line, i) => (
                                <div key={i} className="leading-5 hover:bg-white/5 px-2 -mx-2 rounded">
                                    <span className="text-gray-600 select-none mr-3">{String(i + 1).padStart(4)}</span>
                                    {line}
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-gray-500 py-16">
                                <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>Log dosyası bulunamadı veya boş</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
