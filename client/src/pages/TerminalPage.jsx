import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap, Dot, Pill } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

export default function TerminalPage() {
    const [searchParams] = useSearchParams();
    const { token } = useAuth();
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const wsRef = useRef(null);
    const queryClient = useQueryClient();
    const [connected, setConnected] = useState(false);
    const [activeScreen, setActiveScreen] = useState(null);
    const [newScreenName, setNewScreenName] = useState('');
    const [showNewScreen, setShowNewScreen] = useState(false);
    const [cmdInput, setCmdInput] = useState('');
    const [cmdTarget, setCmdTarget] = useState('');

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

    const sendCmdMutation = useMutation({
        mutationFn: ({ name, command }) => api.post(`/terminal/screens/${name}/send`, { command }),
        onSuccess: () => { setCmdInput(''); toast.success(`→ ${cmdTarget}`); },
        onError: (err) => toast.error(err.response?.data?.error || 'Gönderilemedi'),
    });

    const handleSendCmd = () => {
        const cmd = cmdInput.trim();
        const target = cmdTarget || activeScreen;
        if (!cmd || !target) return;
        sendCmdMutation.mutate({ name: target, command: cmd });
    };

    const attachScreen = async (name) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            toast.error('Terminal bağlı değil');
            return;
        }
        try {
            if (activeScreen) {
                wsRef.current.send(JSON.stringify({ type: 'input', data: '\x01d' }));
                await new Promise(r => setTimeout(r, 250));
            }
            wsRef.current.send(JSON.stringify({ type: 'attach', name }));
            setActiveScreen(name);
            setCmdTarget(name);
            queryClient.invalidateQueries({ queryKey: ['terminalScreens'] });
        } catch (err) {
            toast.error(err.message || 'Bağlanılamadı');
        }
    };

    const detachScreen = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'input', data: '\x01d' }));
        }
        setActiveScreen(null);
    };

    const initTerminal = useCallback(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new Terminal({
            theme: {
                background: A.bgDeeper,
                foreground: '#c9d1d9',
                cursor: 'var(--accent)',
                selectionBackground: 'rgba(167,139,250,0.2)',
                black: '#1f2228',
                brightBlack: '#2a2e36',
                red: '#f87171',
                brightRed: '#fca5a5',
                green: '#4ade80',
                brightGreen: '#86efac',
                yellow: '#fbbf24',
                brightYellow: '#fde68a',
                blue: '#60a5fa',
                brightBlue: '#93c5fd',
                magenta: '#a78bfa',
                brightMagenta: '#c4b5fd',
                cyan: '#22d3ee',
                brightCyan: '#67e8f9',
                white: '#c9d1d9',
                brightWhite: '#e8eaed',
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

        const termEl = terminalRef.current;
        const wheelHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const lines = Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
            term.scrollLines(lines);
        };
        termEl.addEventListener('wheel', wheelHandler, { passive: false, capture: true });

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
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

        term.onData(data => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

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
            termEl.removeEventListener('wheel', wheelHandler, { capture: true });
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px - 32px)', gap: 12 }}>
            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <I.Terminal size={16} style={{ color: 'var(--accent)' }}/>
                    <Cap style={{ fontSize: 11 }}>Terminal</Cap>
                    <Pill>bash · pty</Pill>
                </div>
                <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: A.mono, fontSize: 11,
                    color: connected ? A.ok : A.err,
                }}>
                    <Dot color={connected ? A.ok : A.err} size={6}/>
                    {connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
            </div>

            <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
                {/* ── Sol: Screen listesi ── */}
                <div style={{
                    width: 220, flexShrink: 0, display: 'flex',
                    flexDirection: 'column', gap: 8,
                }}>
                    {/* Screen listesi kartı */}
                    <div style={{
                        flex: 1, background: A.panel, border: `1px solid ${A.border}`,
                        borderRadius: 4, display: 'flex', flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        {/* Başlık */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderBottom: `1px solid ${A.border}`,
                        }}>
                            <Cap>Screen Oturumları</Cap>
                            <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['terminalScreens'] })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 2 }}
                                onMouseEnter={e => e.currentTarget.style.color = A.text}
                                onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                <I.Restart size={12}/>
                            </button>
                        </div>

                        {/* Liste */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                            {loadingScreens ? (
                                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {[1, 2].map(i => (
                                        <div key={i} style={{
                                            height: 36, background: A.bgDeeper,
                                            borderRadius: 2, border: `1px solid ${A.border}`,
                                        }}/>
                                    ))}
                                </div>
                            ) : screens.length === 0 ? (
                                <div style={{
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    padding: '24px 12px', gap: 6,
                                }}>
                                    <I.Terminal size={20} style={{ color: A.faintest }}/>
                                    <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                                        Screen yok
                                    </span>
                                </div>
                            ) : (
                                screens.map(screen => {
                                    const isActive = activeScreen === screen.name;
                                    const isDetached = screen.status?.toLowerCase().includes('detach');
                                    return (
                                        <div key={screen.fullId} style={{
                                            margin: '3px 8px', borderRadius: 2,
                                            background: isActive ? 'rgba(167,139,250,0.08)' : 'transparent',
                                            border: `1px solid ${isActive ? 'rgba(167,139,250,0.3)' : 'transparent'}`,
                                            padding: '8px 10px',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                        fontFamily: A.mono, fontSize: 11,
                                                        color: isActive ? 'var(--accent)' : A.text,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>
                                                        {isActive && <Dot color="var(--accent)" size={5}/>}
                                                        {screen.name}
                                                    </div>
                                                    <div style={{
                                                        fontFamily: A.mono, fontSize: 9,
                                                        color: isDetached ? A.warn : A.ok,
                                                        marginTop: 2, letterSpacing: '0.04em',
                                                    }}>
                                                        {(screen.status || '').toUpperCase()}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                                    {isActive ? (
                                                        <button onClick={detachScreen}
                                                            style={{
                                                                background: 'transparent',
                                                                border: `1px solid ${A.border}`,
                                                                color: 'var(--accent)',
                                                                fontFamily: A.mono, fontSize: 9,
                                                                padding: '2px 6px', borderRadius: 2,
                                                                cursor: 'pointer', letterSpacing: '0.04em',
                                                            }}>
                                                            ÇIK
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => attachScreen(screen.name)} disabled={!connected}
                                                            style={{
                                                                background: 'none', border: 'none',
                                                                cursor: 'pointer', color: A.faint, padding: 3,
                                                                opacity: !connected ? 0.4 : 1,
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                                                            onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                                            <I.ArrowUpRight size={12}/>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`'${screen.name}' kapatılsın mı?`)) {
                                                                killScreenMutation.mutate(screen.name);
                                                                if (isActive) setActiveScreen(null);
                                                            }
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 3 }}
                                                        onMouseEnter={e => e.currentTarget.style.color = A.err}
                                                        onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                                        <I.Trash size={12}/>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Yeni screen */}
                        <div style={{ padding: '8px', borderTop: `1px solid ${A.border}` }}>
                            {showNewScreen ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input
                                        value={newScreenName}
                                        onChange={e => setNewScreenName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newScreenName) createScreenMutation.mutate(newScreenName);
                                            if (e.key === 'Escape') setShowNewScreen(false);
                                        }}
                                        placeholder="screen-adı"
                                        autoFocus
                                        style={{
                                            background: A.bg, border: `1px solid ${A.border}`,
                                            color: A.text, fontFamily: A.mono, fontSize: 11,
                                            padding: '6px 8px', borderRadius: 2, outline: 'none', width: '100%',
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                        onBlur={e => e.target.style.borderColor = A.border}
                                    />
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button
                                            onClick={() => newScreenName && createScreenMutation.mutate(newScreenName)}
                                            disabled={!newScreenName || createScreenMutation.isPending}
                                            style={{
                                                ...btnPrimary, flex: 1, fontSize: 10, padding: '5px 8px',
                                                opacity: !newScreenName ? 0.4 : 1,
                                                cursor: !newScreenName ? 'not-allowed' : 'pointer',
                                            }}>
                                            OLUŞTUR
                                        </button>
                                        <button onClick={() => setShowNewScreen(false)}
                                            style={{
                                                ...btnGhost, padding: '5px 8px',
                                            }}>
                                            <I.X size={12}/>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setShowNewScreen(true)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: 6,
                                        padding: '7px 0', background: 'transparent',
                                        border: `1px dashed ${A.border}`,
                                        borderRadius: 2, cursor: 'pointer',
                                        color: A.faint, fontFamily: A.mono, fontSize: 10,
                                        letterSpacing: '0.04em',
                                        transition: 'border-color 120ms, color 120ms',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = A.dim; e.currentTarget.style.color = A.text; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = A.border; e.currentTarget.style.color = A.faint; }}>
                                    <I.Plus size={11}/> YENİ SCREEN
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Kısayollar */}
                    <div style={{
                        background: A.panel, border: `1px solid ${A.border}`,
                        borderRadius: 4, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
                    }}>
                        <Cap style={{ marginBottom: 4 }}>Kısayollar</Cap>
                        {[
                            ['Ctrl+A D', "Screen'den çık"],
                            ['Ctrl+L', 'Temizle'],
                            ['Shift+↑↓', 'Scroll'],
                        ].map(([key, label]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <span style={{ fontSize: 10, color: A.faint }}>{label}</span>
                                <span style={{
                                    fontFamily: A.mono, fontSize: 10, color: A.dim,
                                    background: A.bg, border: `1px solid ${A.border}`,
                                    padding: '1px 6px', borderRadius: 2,
                                }}>{key}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Sağ: Terminal ── */}
                <div style={{
                    flex: 1, minWidth: 0,
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderRadius: 4, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* Terminal başlık çubuğu */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px', borderBottom: `1px solid ${A.border}`,
                        background: A.bgDeeper, flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 99, background: A.err }}/>
                            <span style={{ width: 10, height: 10, borderRadius: 99, background: A.warn }}/>
                            <span style={{ width: 10, height: 10, borderRadius: 99, background: A.ok }}/>
                        </div>
                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                            {activeScreen ? `screen: ${activeScreen}` : 'bash · /'}
                        </span>
                        {activeScreen && (
                            <Pill color="var(--accent)" bg="rgba(167,139,250,0.1)">ATTACHED</Pill>
                        )}
                    </div>

                    {/* FTB / pending command banner */}
                    {pendingCommand && (
                        <div style={{
                            padding: '8px 14px', background: 'rgba(251,191,36,0.07)',
                            borderBottom: `1px solid rgba(251,191,36,0.15)`,
                            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                        }}>
                            <I.Terminal size={12} style={{ color: A.warn, flexShrink: 0 }}/>
                            <span style={{ fontFamily: A.mono, fontSize: 11, color: A.warn }}>
                                Kurulum komutu hazır:&nbsp;
                                <span style={{ color: A.text, background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: 2 }}>
                                    {pendingCommand}
                                </span>
                            </span>
                        </div>
                    )}

                    {/* xterm viewport */}
                    <div ref={terminalRef} style={{ flex: 1, minHeight: 0, padding: '6px' }}/>

                    {/* Screen komut gönder */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderTop: `1px solid ${A.border}`,
                        background: A.bgDeeper, flexShrink: 0,
                    }}>
                        <I.Send size={11} style={{ color: A.faint, flexShrink: 0 }}/>
                        <Cap style={{ flexShrink: 0 }}>Screen'e gönder</Cap>
                        <select value={cmdTarget} onChange={e => setCmdTarget(e.target.value)}
                            style={{
                                background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.mono, fontSize: 11,
                                padding: '4px 8px', borderRadius: 2, outline: 'none', flexShrink: 0,
                            }}>
                            <option value="">— seç —</option>
                            {screens.map(s => (
                                <option key={s.fullId} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                        <input
                            value={cmdInput}
                            onChange={e => setCmdInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSendCmd(); }}
                            placeholder={cmdTarget ? `${cmdTarget} → komut gir` : 'Önce screen seç'}
                            disabled={!cmdTarget}
                            style={{
                                flex: 1, background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.mono, fontSize: 11,
                                padding: '5px 8px', borderRadius: 2, outline: 'none',
                                opacity: !cmdTarget ? 0.4 : 1,
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                            onBlur={e => e.target.style.borderColor = A.border}
                        />
                        <button onClick={handleSendCmd}
                            disabled={!cmdTarget || !cmdInput.trim() || sendCmdMutation.isPending}
                            style={{
                                ...btnPrimary, display: 'flex', alignItems: 'center',
                                gap: 5, padding: '5px 12px', fontSize: 10,
                                opacity: (!cmdTarget || !cmdInput.trim()) ? 0.4 : 1,
                                cursor: (!cmdTarget || !cmdInput.trim()) ? 'not-allowed' : 'pointer',
                            }}>
                            <I.Send size={11}/> GÖNDER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
