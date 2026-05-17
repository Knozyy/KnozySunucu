import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineCommandLine,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineArrowRightOnRectangle,
    HiOutlineArrowPath,
    HiOutlineXMark,
} from 'react-icons/hi2';

export default function TerminalPage() {
    const [searchParams] = useSearchParams();
    const { token } = useAuth();
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const wsRef = useRef(null);
    const queryClient = useQueryClient();
    const [connected, setConnected] = useState(false);
    const [activeScreen, setActiveScreen] = useState(null); // şu an bağlı olunan screen adı
    const [newScreenName, setNewScreenName] = useState('');
    const [showNewScreen, setShowNewScreen] = useState(false);

    // URL'den komut parametresini al (FTB yönlendirme)
    const pendingCommand = searchParams.get('run');

    const { data: screensData, isLoading: loadingScreens } = useQuery({
        queryKey: ['terminalScreens'],
        queryFn: () => api.get('/terminal/screens').then(r => r.data),
        refetchInterval: 5000,
    });

    const createScreenMutation = useMutation({
        mutationFn: (name) => api.post('/terminal/screens', { name }),
        onSuccess: () => {
            toast.success('Screen oluşturuldu');
            setNewScreenName('');
            setShowNewScreen(false);
            queryClient.invalidateQueries({ queryKey: ['terminalScreens'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Screen oluşturulamadı'),
    });

    const killScreenMutation = useMutation({
        mutationFn: (name) => api.delete(`/terminal/screens/${name}`),
        onSuccess: () => {
            toast.success('Screen kapatıldı');
            queryClient.invalidateQueries({ queryKey: ['terminalScreens'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Screen kapatılamadı'),
    });

    const attachScreen = async (name) => {
        try {
            // Önce Ctrl+A D ile mevcut screen'den çık (bash'taysa etki etmez)
            if (activeScreen && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data: '\x01d' }));
                await new Promise(r => setTimeout(r, 300));
            }
            await api.post(`/terminal/screens/${name}/attach`);
            setActiveScreen(name);
            queryClient.invalidateQueries({ queryKey: ['terminalScreens'] });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Bağlanılamadı');
        }
    };

    const detachScreen = () => {
        // Ctrl+A D gönder — screen'den çık, bash'e dön
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'input', data: '\x01d' }));
        }
        setActiveScreen(null);
    };

    // Terminal başlat
    const initTerminal = useCallback(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new Terminal({
            theme: {
                background: '#111827',
                foreground: '#d1d5db',
                cursor: '#6b7280',
                selectionBackground: '#374151',
                black: '#1f2937',
                brightBlack: '#374151',
                red: '#ef4444',
                brightRed: '#f87171',
                green: '#22c55e',
                brightGreen: '#4ade80',
                yellow: '#eab308',
                brightYellow: '#facc15',
                blue: '#3b82f6',
                brightBlue: '#60a5fa',
                magenta: '#a855f7',
                brightMagenta: '#c084fc',
                cyan: '#06b6d4',
                brightCyan: '#22d3ee',
                white: '#d1d5db',
                brightWhite: '#f9fafb',
            },
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'block',
            allowTransparency: false,
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // WebSocket bağlantısı
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            // URL'den gelen komutu çalıştır
            if (pendingCommand) {
                setTimeout(() => {
                    ws.send(JSON.stringify({ type: 'input', data: `${pendingCommand}\r` }));
                }, 800);
            }
        };

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'output') term.write(msg.data);
            } catch { /* ignore */ }
        };

        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);

        // Kullanıcı girişi → WebSocket
        term.onData(data => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

        // Resize
        const resizeObserver = new ResizeObserver(() => {
            try {
                fitAddon.fit();
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
                }
            } catch { /* ignore */ }
        });
        if (terminalRef.current) resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            ws.close();
            term.dispose();
            xtermRef.current = null;
            wsRef.current = null;
        };
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const cleanup = initTerminal();
        return cleanup;
    }, [initTerminal]);

    const screens = screensData?.screens || [];

    const statusColor = connected ? 'bg-green-500' : 'bg-gray-400';
    const statusText = connected ? 'Bağlı' : 'Bağlantı kesik';

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Terminal</h1>
                    <p className="text-gray-500 text-sm mt-1">Sunucu bash terminali ve screen yönetimi</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                    <span className="text-sm text-gray-500">{statusText}</span>
                </div>
            </div>

            <div className="flex gap-4 flex-1 min-h-0">
                {/* ── Sol: Screen Listesi ── */}
                <div className="w-56 flex-shrink-0 flex flex-col gap-3">
                    <div className="glass-card p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Screen Oturumları</p>
                            <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['terminalScreens'] })}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Yenile"
                            >
                                <HiOutlineArrowPath className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {loadingScreens ? (
                            <div className="space-y-2">
                                {[1, 2].map(i => <div key={i} className="skeleton h-10 rounded-xl" />)}
                            </div>
                        ) : screens.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                                <HiOutlineCommandLine className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-xs">Screen yok</p>
                            </div>
                        ) : (
                            <div className="space-y-1 flex-1 overflow-y-auto">
                                {screens.map(screen => {
                                    const isActive = activeScreen === screen.name;
                                    return (
                                        <div
                                            key={screen.fullId}
                                            className={`rounded-xl border p-2.5 transition-colors ${isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                                                        {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 mb-0.5" />}
                                                        {screen.name}
                                                    </p>
                                                    <p className={`text-xs mt-0.5 ${screen.status?.toLowerCase().includes('detached') ? 'text-amber-500' : 'text-green-500'}`}>
                                                        {screen.status}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {isActive ? (
                                                        <button
                                                            onClick={detachScreen}
                                                            className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors font-medium"
                                                            title="Screen'den çık (Ctrl+A D)"
                                                        >
                                                            Çık
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => attachScreen(screen.name)}
                                                            disabled={!connected}
                                                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                                                            title="Terminale bağlan"
                                                        >
                                                            <HiOutlineArrowRightOnRectangle className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`'${screen.name}' screen'ini kapatmak istiyor musunuz?`)) {
                                                                killScreenMutation.mutate(screen.name);
                                                                if (isActive) setActiveScreen(null);
                                                            }
                                                        }}
                                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Kapat"
                                                    >
                                                        <HiOutlineTrash className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Yeni Screen */}
                        {showNewScreen ? (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={newScreenName}
                                    onChange={e => setNewScreenName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && newScreenName) createScreenMutation.mutate(newScreenName);
                                        if (e.key === 'Escape') setShowNewScreen(false);
                                    }}
                                    placeholder="screen-adı"
                                    className="input-field text-sm py-1.5 font-mono"
                                    autoFocus
                                />
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => newScreenName && createScreenMutation.mutate(newScreenName)}
                                        disabled={!newScreenName || createScreenMutation.isPending}
                                        className="btn-primary text-xs py-1.5 flex-1"
                                    >
                                        Oluştur
                                    </button>
                                    <button
                                        onClick={() => setShowNewScreen(false)}
                                        className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg"
                                    >
                                        <HiOutlineXMark className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowNewScreen(true)}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 hover:border-gray-400 rounded-xl transition-all"
                            >
                                <HiOutlinePlus className="w-4 h-4" /> Yeni Screen
                            </button>
                        )}
                    </div>

                    {/* Klavye kısayolları */}
                    <div className="glass-card p-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Kısayollar</p>
                        <div className="space-y-1 text-xs text-gray-500">
                            <div className="flex justify-between">
                                <span>Screen'den çık</span>
                                <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Ctrl+A D</kbd>
                            </div>
                            <div className="flex justify-between">
                                <span>Scroll</span>
                                <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Shift+↑↓</kbd>
                            </div>
                            <div className="flex justify-between">
                                <span>Temizle</span>
                                <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Ctrl+L</kbd>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Sağ: Terminal ── */}
                <div className="flex-1 min-w-0 glass-card overflow-hidden flex flex-col">
                    {/* FTB / pending command banner */}
                    {pendingCommand && (
                        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-shrink-0">
                            <HiOutlineCommandLine className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700 flex-1">
                                <strong>Kurulum komutu hazır:</strong> <code className="font-mono bg-amber-100 px-1 rounded">{pendingCommand}</code>
                            </p>
                        </div>
                    )}
                    <div
                        ref={terminalRef}
                        className="flex-1 p-2"
                        style={{ minHeight: 0 }}
                    />
                </div>
            </div>
        </div>
    );
}
