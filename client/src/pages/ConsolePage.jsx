import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineCommandLine,
    HiOutlineSignal,
    HiOutlineTrash,
    HiOutlinePaperAirplane,
} from 'react-icons/hi2';

export default function ConsolePage() {
    const { token } = useAuth();
    const { logs, status, connected, sendCommand, clearLogs } = useWebSocket(token);
    const { t } = useI18n();
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const logsEndRef = useRef(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

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
                    <button onClick={clearLogs} className="btn-secondary text-xs py-1.5 px-3">
                        <HiOutlineTrash className="w-4 h-4" /> {t('console.clear')}
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden fade-in">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <span className="ml-2 text-xs text-gray-400 font-mono">minecraft-server-console</span>
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
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-white border-none outline-none px-2 py-3 text-gray-900 font-mono text-sm placeholder:text-gray-400"
                        placeholder="Komut girin... (örn: list, say Merhaba, op player)"
                        disabled={!connected || status?.status !== 'running'}
                    />
                    <button type="submit" disabled={!command.trim() || !connected} className="px-4 text-gray-900 hover:text-gray-600 transition-colors disabled:text-gray-300">
                        <HiOutlinePaperAirplane className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
