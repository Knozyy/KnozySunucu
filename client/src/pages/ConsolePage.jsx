import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Dot, Pill, Input } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

// ── Log seviyesi renklendirme ───────────────────────────────────────────
function logColor(line) {
    if (line.startsWith('>') || line.startsWith('[CMD]')) return '#93c5fd';
    if (/FATAL|STDERR/.test(line)) return '#fca5a5';
    if (/ERROR/.test(line)) return '#f87171';
    if (/WARN/.test(line)) return '#fbbf24';
    if (/\[System\]/.test(line)) return '#818cf8';
    if (/DEBUG/.test(line)) return A.faint;
    return A.dim;
}

function logLevel(line) {
    if (/FATAL|STDERR|ERROR/.test(line)) return 'error';
    if (/WARN/.test(line)) return 'warn';
    if (/DEBUG/.test(line)) return 'debug';
    if (/INFO/.test(line)) return 'info';
    return 'info';
}

// ── Ana sayfa ───────────────────────────────────────────────────────────
export default function ConsolePage() {
    const { token, user, canAccess } = useAuth();
    // Konsola komut yazma izni: admin VEYA kategoride 'console_command'
    const canCommand = user?.role === 'admin' || canAccess('console_command');
    const [selectedServerId, setSelectedServerId] = useState(null);

    const { data: serversData } = useQuery({
        queryKey: ['servers-status'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 5000,
    });
    const servers = serversData?.servers || [];

    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0] || null;
    const { logs, status, connected, sendCommand, clearLogs } = useWebSocket(token, selectedServerId);

    const [activeTab, setActiveTab] = useState('console');
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('all');
    const logsEndRef = useRef(null);
    const cmdRef = useRef(null);

    useEffect(() => {
        if (activeTab === 'console') logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs, activeTab]);

    // ── filtrelenmiş loglar ─────────────────────────────────────────────
    const filteredLogs = useMemo(() => {
        return logs.filter(line => {
            if (levelFilter !== 'all' && logLevel(line) !== levelFilter) return false;
            if (search && !line.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [logs, levelFilter, search]);

    // ── canlı istatistikler ─────────────────────────────────────────────
    const stats = useMemo(() => {
        const errors = logs.filter(l => /ERROR|FATAL/.test(l)).length;
        const warns  = logs.filter(l => /WARN/.test(l)).length;
        const infos  = logs.filter(l => /INFO/.test(l)).length;
        const debugs = logs.filter(l => /DEBUG/.test(l)).length;
        const lastErr = [...logs].reverse().find(l => /ERROR|FATAL/.test(l));
        return { errors, warns, infos, debugs, total: logs.length, lastErr };
    }, [logs]);

    const players = status?.players || [];

    // ── komut gönderme ──────────────────────────────────────────────────
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!command.trim() || !canCommand) return;
        sendCommand(command.trim());
        setCommandHistory(prev => [command.trim(), ...prev.slice(0, 49)]);
        setCommand('');
        setHistoryIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const idx = Math.min(historyIndex + 1, commandHistory.length - 1);
            setHistoryIndex(idx);
            setCommand(commandHistory[idx] || '');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const idx = Math.max(historyIndex - 1, -1);
            setHistoryIndex(idx);
            setCommand(idx === -1 ? '' : commandHistory[idx]);
        }
    };

    const canSend = connected && (status?.status === 'running' || status?.status === 'starting');

    // ── sekmeler ────────────────────────────────────────────────────────
    const tabs = [
        { id: 'console', icon: I.Console,  label: 'Konsol',        badge: 'LIVE' },
        { id: 'macros',  icon: I.Stack,    label: 'Makrolar' },
        { id: 'archive', icon: I.Archive,  label: 'Arşiv' },
        { id: 'crash',   icon: I.Alert,    label: 'Crash' },
        { id: 'logs',    icon: I.Folder,   label: 'Log Dosyaları' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 56px - 32px)' }}>
            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <I.Console size={16} style={{ color: 'var(--accent)' }}/>
                    <Cap style={{ fontSize: 11 }}>Konsol</Cap>
                    {selectedServer && (
                        <Pill>{selectedServer.name || `Sunucu ${selectedServer.id}`}</Pill>
                    )}
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

            {/* ── Sunucu sekmeleri (2+ sunucu) ── */}
            {servers.length > 1 && (
                <div style={{
                    display: 'flex', gap: 2,
                    background: A.panel, border: `1px solid ${A.border}`,
                    padding: 4, borderRadius: 4, flexShrink: 0,
                }}>
                    {servers.map((srv, idx) => {
                        const isActive = selectedServer?.id === srv.id;
                        const srvStatus = srv.status;
                        const dotColor = srvStatus === 'running' ? A.ok : srvStatus === 'starting' ? A.warn : A.faintest;
                        return (
                            <button key={srv.id}
                                onClick={() => { setSelectedServerId(srv.id); clearLogs(); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 14px', borderRadius: 2, border: 'none',
                                    cursor: 'pointer', fontFamily: A.sans, fontSize: 12,
                                    background: isActive ? A.bgDeeper : 'transparent',
                                    color: isActive ? A.text : A.dim,
                                    borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                                    transition: 'all 120ms',
                                }}>
                                <Dot color={dotColor} size={6}/>
                                <span style={{ fontWeight: isActive ? 500 : 400 }}>
                                    Sunucu {idx + 1}
                                </span>
                                <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                    {srv.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── İçerik sekme çubuğu ── */}
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '6px 12px', border: 'none', cursor: 'pointer',
                                fontFamily: A.sans, fontSize: 12, borderRadius: 2,
                                background: isActive ? A.panel : 'transparent',
                                color: isActive ? A.text : A.dim,
                                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                                transition: 'all 120ms',
                            }}>
                            <tab.icon size={13}/>
                            {tab.label}
                            {tab.badge && <Pill style={{ padding: '1px 5px', fontSize: 9 }}>{tab.badge}</Pill>}
                        </button>
                    );
                })}
            </div>

            {/* ── Sekme içerikleri ── */}
            {activeTab === 'macros' ? (
                <MacrosPanel mcStatus={status?.status} sendCommand={sendCommand} serverId={selectedServerId}/>
            ) : activeTab === 'archive' ? (
                <LogArchivePanel/>
            ) : activeTab === 'crash' ? (
                <CrashReportsPanel/>
            ) : activeTab === 'logs' ? (
                <LogFilesPanel/>
            ) : (
                /* ── Ana Konsol ── */
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderRadius: 4, overflow: 'hidden', minHeight: 0,
                }}>
                    {/* Filtre çubuğu */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderBottom: `1px solid ${A.border}`,
                        background: A.bgDeeper, flexShrink: 0,
                    }}>
                        {/* Arama */}
                        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
                            <I.Search size={12} style={{
                                position: 'absolute', left: 8, top: '50%',
                                transform: 'translateY(-50%)', color: A.faint,
                            }}/>
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Loglarda ara..."
                                style={{
                                    background: A.bg, border: `1px solid ${A.border}`,
                                    color: A.text, fontFamily: A.mono, fontSize: 11,
                                    padding: '5px 8px 5px 26px', borderRadius: 2,
                                    width: '100%', outline: 'none',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                onBlur={e => e.target.style.borderColor = A.border}
                            />
                        </div>
                        {/* Seviye filtreleri */}
                        {['all', 'info', 'warn', 'error', 'debug'].map(lvl => (
                            <button key={lvl} onClick={() => setLevelFilter(lvl)}
                                style={{
                                    padding: '3px 9px', borderRadius: 2, border: 'none',
                                    cursor: 'pointer', fontFamily: A.mono, fontSize: 10,
                                    letterSpacing: '0.06em', textTransform: 'uppercase',
                                    background: levelFilter === lvl
                                        ? (lvl === 'error' ? 'rgba(248,113,113,0.15)'
                                         : lvl === 'warn'  ? 'rgba(251,191,36,0.12)'
                                         : lvl === 'debug' ? 'rgba(255,255,255,0.05)'
                                         : 'rgba(167,139,250,0.12)')
                                        : 'transparent',
                                    color: levelFilter === lvl
                                        ? (lvl === 'error' ? '#f87171'
                                         : lvl === 'warn'  ? '#fbbf24'
                                         : lvl === 'debug' ? A.dim
                                         : 'var(--accent)')
                                        : A.faint,
                                }}>
                                {lvl}
                            </button>
                        ))}
                        <div style={{ flex: 1 }}/>
                        <button onClick={clearLogs}
                            style={{
                                ...btnGhost, display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', fontSize: 11,
                            }}>
                            <I.Trash size={11}/> Temizle
                        </button>
                    </div>

                    {/* Gövde: log viewport + sidebar */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 220px', minHeight: 0 }}>
                        {/* Log viewport */}
                        <div style={{
                            overflowY: 'auto', padding: '10px 0',
                            borderRight: `1px solid ${A.border}`,
                        }}>
                            {filteredLogs.length === 0 ? (
                                <div style={{
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    height: '100%', gap: 10, color: A.faintest,
                                }}>
                                    <I.Console size={28} style={{ color: A.faintest }}/>
                                    <span style={{ fontFamily: A.mono, fontSize: 11 }}>
                                        {logs.length > 0 ? 'Filtre sonucu yok' : 'Konsol çıktısı bekleniyor...'}
                                    </span>
                                </div>
                            ) : (
                                filteredLogs.map((line, i) => (
                                    <div key={i} style={{
                                        padding: '1px 14px',
                                        fontFamily: A.mono, fontSize: 11,
                                        color: logColor(line), lineHeight: 1.55,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        {line}
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef}/>
                        </div>

                        {/* Sağ panel */}
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            gap: 0, overflowY: 'auto',
                            background: A.bgDeeper,
                        }}>
                            {/* Canlı istatistikler */}
                            <SideSection title="Canlı İstatistikler">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    <StatBox label="TOPLAM" value={stats.total} color={A.text}/>
                                    <StatBox label="HATA" value={stats.errors} color={stats.errors > 0 ? A.err : A.faint}/>
                                    <StatBox label="UYARI" value={stats.warns} color={stats.warns > 0 ? A.warn : A.faint}/>
                                    <StatBox label="BİLGİ" value={stats.infos} color={A.dim}/>
                                </div>
                            </SideSection>

                            {/* Son hata */}
                            {stats.lastErr && (
                                <SideSection title="Son Hata">
                                    <div style={{
                                        fontFamily: A.mono, fontSize: 10, color: A.err,
                                        lineHeight: 1.5, wordBreak: 'break-all',
                                        background: 'rgba(248,113,113,0.06)',
                                        padding: '6px 8px', borderRadius: 2,
                                    }}>
                                        {stats.lastErr.length > 120
                                            ? stats.lastErr.slice(0, 120) + '…'
                                            : stats.lastErr}
                                    </div>
                                </SideSection>
                            )}

                            {/* Online oyuncular */}
                            <SideSection title={`Online (${players.length})`}>
                                {players.length === 0 ? (
                                    <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                                        Kimse yok
                                    </span>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {players.slice(0, 8).map(p => (
                                            <div key={p} style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                fontFamily: A.mono, fontSize: 11, color: A.text,
                                            }}>
                                                <Dot color={A.ok} size={5}/>
                                                {typeof p === 'string' ? p : p.name || p}
                                            </div>
                                        ))}
                                        {players.length > 8 && (
                                            <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>
                                                +{players.length - 8} daha
                                            </span>
                                        )}
                                    </div>
                                )}
                            </SideSection>

                            {/* Komut geçmişi */}
                            {commandHistory.length > 0 && (
                                <SideSection title="Geçmiş">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {commandHistory.slice(0, 10).map((cmd, i) => (
                                            <button key={i}
                                                onClick={() => { setCommand(cmd); cmdRef.current?.focus(); }}
                                                style={{
                                                    textAlign: 'left', background: 'transparent',
                                                    border: 'none', cursor: 'pointer',
                                                    fontFamily: A.mono, fontSize: 10,
                                                    color: A.dim, padding: '2px 0',
                                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.color = A.text}
                                                onMouseLeave={e => e.currentTarget.style.color = A.dim}>
                                                <span style={{ color: A.faint }}>› </span>{cmd}
                                            </button>
                                        ))}
                                    </div>
                                </SideSection>
                            )}
                        </div>
                    </div>

                    {/* Komut giriş çubuğu */}
                    <form onSubmit={handleSubmit} style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        borderTop: `1px solid ${A.border}`, flexShrink: 0,
                        background: A.bgDeeper,
                    }}>
                        <span style={{
                            padding: '0 12px', fontFamily: A.mono, fontSize: 13,
                            color: canSend ? 'var(--accent)' : A.faintest,
                            userSelect: 'none',
                        }}>›</span>
                        <input ref={cmdRef}
                            value={command}
                            onChange={e => setCommand(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={!canCommand
                                ? 'Konsola komut yazma yetkiniz yok'
                                : canSend
                                    ? 'Komut gir... (↑↓ geçmiş)'
                                    : 'Sunucu çalışmıyor'}
                            disabled={!canSend || !canCommand}
                            style={{
                                flex: 1, background: 'transparent', border: 'none',
                                outline: 'none', fontFamily: A.mono, fontSize: 12,
                                color: A.text, padding: '11px 0',
                                opacity: (canSend && canCommand) ? 1 : 0.4,
                            }}
                        />
                        <button type="submit"
                            disabled={!command.trim() || !canSend || !canCommand}
                            style={{
                                ...btnPrimary, borderRadius: 0, padding: '10px 16px',
                                fontSize: 11, flexShrink: 0, letterSpacing: '0.08em',
                                opacity: (!command.trim() || !canSend || !canCommand) ? 0.4 : 1,
                                cursor: (!command.trim() || !canSend || !canCommand) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                            <I.Send size={12}/> GÖNDER
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

// ── Sağ panel bölümü ────────────────────────────────────────────────────
function SideSection({ title, children }) {
    return (
        <div style={{ padding: '12px 12px', borderBottom: `1px solid ${A.border}` }}>
            <Cap style={{ display: 'block', marginBottom: 8 }}>{title}</Cap>
            {children}
        </div>
    );
}

function StatBox({ label, value, color }) {
    return (
        <div style={{
            background: A.bg, border: `1px solid ${A.border}`,
            padding: '5px 8px', borderRadius: 2,
        }}>
            <Cap style={{ fontSize: 8 }}>{label}</Cap>
            <div style={{ fontFamily: A.mono, fontSize: 13, color, marginTop: 2 }}>{value}</div>
        </div>
    );
}

// ============================================================
// LOG DOSYALARI PANELİ
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
            const lv = logLevel(line);
            if (levelFilter === 'error' && lv !== 'error') return false;
            if (levelFilter === 'warn' && lv !== 'warn') return false;
            if (levelFilter === 'info' && lv !== 'info') return false;
        }
        if (search && !line.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                background: A.panel, border: `1px solid ${A.border}`,
                padding: '8px 12px', borderRadius: 4,
            }}>
                <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)}
                    style={{
                        background: A.bg, border: `1px solid ${A.border}`,
                        color: A.text, fontFamily: A.mono, fontSize: 11,
                        padding: '5px 8px', borderRadius: 2, outline: 'none',
                    }}>
                    {logFiles?.files?.map(f => (
                        <option key={f.name} value={f.name}>
                            {f.name} ({(f.size / 1024).toFixed(0)} KB)
                        </option>
                    ))}
                </select>
                <div style={{ position: 'relative' }}>
                    <I.Search size={11} style={{
                        position: 'absolute', left: 7, top: '50%',
                        transform: 'translateY(-50%)', color: A.faint,
                    }}/>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Ara..."
                        style={{
                            background: A.bg, border: `1px solid ${A.border}`,
                            color: A.text, fontFamily: A.mono, fontSize: 11,
                            padding: '5px 8px 5px 24px', borderRadius: 2, outline: 'none', width: 160,
                        }}
                    />
                </div>
                {['all', 'error', 'warn', 'info'].map(lvl => (
                    <button key={lvl} onClick={() => setLevelFilter(lvl)}
                        style={{
                            padding: '3px 8px', borderRadius: 2, border: 'none',
                            cursor: 'pointer', fontFamily: A.mono, fontSize: 10,
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            background: levelFilter === lvl ? 'rgba(167,139,250,0.12)' : 'transparent',
                            color: levelFilter === lvl ? 'var(--accent)' : A.faint,
                        }}>{lvl}</button>
                ))}
                <div style={{ flex: 1 }}/>
                <Cap>{lines.length} satır</Cap>
            </div>

            <div style={{
                flex: 1, background: A.bgDeeper, border: `1px solid ${A.border}`,
                borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
                <div style={{
                    padding: '6px 14px', borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <Dot color={A.ok} size={5}/>
                    <Cap style={{ fontFamily: A.mono }}>{selectedFile}</Cap>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: A.faint, fontFamily: A.mono, fontSize: 11 }}>
                            Yükleniyor...
                        </div>
                    ) : lines.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: A.faintest, fontFamily: A.mono, fontSize: 11 }}>
                            Log bulunamadı
                        </div>
                    ) : (
                        lines.map((line, i) => (
                            <div key={i} style={{
                                padding: '1px 14px', fontFamily: A.mono, fontSize: 11,
                                color: logColor(line), lineHeight: 1.55,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            <form onSubmit={handleSearch} style={{
                display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
                background: A.panel, border: `1px solid ${A.border}`,
                padding: '8px 12px', borderRadius: 4,
            }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <I.Search size={12} style={{
                        position: 'absolute', left: 8, top: '50%',
                        transform: 'translateY(-50%)', color: A.faint,
                    }}/>
                    <input value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Tüm loglarda ara... (ERROR, oyuncu adı, uuid)"
                        style={{
                            background: A.bg, border: `1px solid ${A.border}`,
                            color: A.text, fontFamily: A.mono, fontSize: 11,
                            padding: '6px 8px 6px 28px', borderRadius: 2,
                            width: '100%', outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = A.border}
                    />
                </div>
                <select value={level} onChange={e => setLevel(e.target.value)}
                    style={{
                        background: A.bg, border: `1px solid ${A.border}`,
                        color: A.text, fontFamily: A.mono, fontSize: 11,
                        padding: '6px 8px', borderRadius: 2, outline: 'none',
                    }}>
                    <option value="all">Tümü</option>
                    <option value="error">Error</option>
                    <option value="warn">Warn</option>
                    <option value="info">Info</option>
                </select>
                <button type="submit" disabled={!query.trim()}
                    style={{
                        ...btnPrimary, fontSize: 11, padding: '6px 14px',
                        opacity: !query.trim() ? 0.4 : 1,
                        cursor: !query.trim() ? 'not-allowed' : 'pointer',
                    }}>
                    ARA
                </button>
            </form>

            {isFetching && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: A.faint, fontFamily: A.mono, fontSize: 11 }}>
                    <div style={{
                        width: 12, height: 12, border: `1.5px solid ${A.border}`,
                        borderTopColor: 'var(--accent)', borderRadius: 99,
                        animation: 'hoodoo-spin 0.8s linear infinite',
                    }}/>
                    Tüm log dosyaları taranıyor...
                </div>
            )}

            {data && !isFetching && (
                <>
                    <div style={{ display: 'flex', gap: 12, fontFamily: A.mono, fontSize: 10, color: A.faint, flexShrink: 0 }}>
                        <span><span style={{ color: A.text }}>{data.total}</span> sonuç</span>
                        <span><span style={{ color: A.text }}>{data.filesSearched}</span> dosya</span>
                        <span><span style={{ color: A.text }}>{(data.scanned || 0).toLocaleString()}</span> satır tarandı</span>
                    </div>
                    <div style={{
                        flex: 1, background: A.bgDeeper, border: `1px solid ${A.border}`,
                        borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                            {data.results.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: A.faintest, fontFamily: A.mono, fontSize: 11 }}>
                                    Sonuç bulunamadı
                                </div>
                            ) : (
                                data.results.map((r, i) => (
                                    <div key={i} style={{
                                        display: 'flex', gap: 10, padding: '2px 14px',
                                        fontFamily: A.mono, fontSize: 11, lineHeight: 1.55,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <span style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, width: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {r.file}:{r.lineNumber}
                                        </span>
                                        <span style={{ color: logColor(r.content) }}>{r.content}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {!data && !isFetching && (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 10,
                    background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                }}>
                    <I.Archive size={28} style={{ color: A.faintest }}/>
                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>
                        latest.log + arşiv .gz dosyalarında arama
                    </span>
                </div>
            )}
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ============================================================
// CRASH RAPORLARI PANELİ
// ============================================================
function CrashReportsPanel() {
    const [selected, setSelected] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['crash-reports'],
        queryFn: () => api.get('/logs/crash-reports').then(r => r.data),
    });

    const { data: detail, isLoading: detailLoading } = useQuery({
        queryKey: ['crash-report-detail', selected],
        queryFn: () => api.get(`/logs/crash-reports/${encodeURIComponent(selected)}`).then(r => r.data),
        enabled: !!selected,
    });

    const reports = data?.reports || [];

    if (isLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div style={{
                    width: 16, height: 16, border: `2px solid ${A.border}`,
                    borderTopColor: 'var(--accent)', borderRadius: 99,
                    animation: 'hoodoo-spin 0.8s linear infinite',
                }}/>
                <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (reports.length === 0) {
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
            }}>
                <I.Alert size={28} style={{ color: A.faintest }}/>
                <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>
                    crash-reports klasörü boş
                </span>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 10, flex: 1, minHeight: 0 }}>
            {/* Rapor listesi */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                overflowY: 'auto',
            }}>
                {reports.map(r => (
                    <button key={r.filename}
                        onClick={() => setSelected(r.filename)}
                        style={{
                            textAlign: 'left',
                            background: selected === r.filename ? 'rgba(248,113,113,0.08)' : A.panel,
                            border: `1px solid ${selected === r.filename ? 'rgba(248,113,113,0.3)' : A.border}`,
                            borderRadius: 4, padding: '10px 12px', cursor: 'pointer',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <I.Alert size={12} style={{ color: A.err, flexShrink: 0 }}/>
                            <span style={{ fontFamily: A.mono, fontSize: 10, color: A.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.filename}
                            </span>
                        </div>
                        {r.description && (
                            <div style={{ fontSize: 11, color: A.faint, lineHeight: 1.4, marginLeft: 20 }}>
                                {r.description}
                            </div>
                        )}
                        <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest, marginLeft: 20, marginTop: 4 }}>
                            {new Date(r.modified).toLocaleString('tr-TR')}
                        </div>
                    </button>
                ))}
            </div>

            {/* Rapor içeriği */}
            {selected ? (
                <div style={{
                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                    borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{
                        padding: '8px 14px', borderBottom: `1px solid ${A.border}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <Dot color={A.err} size={6}/>
                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.dim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selected}
                        </span>
                        <button onClick={() => setSelected(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                            <I.X size={14}/>
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                        {detailLoading ? (
                            <div style={{ textAlign: 'center', padding: '20px 0', color: A.faint, fontFamily: A.mono, fontSize: 11 }}>
                                Yükleniyor...
                            </div>
                        ) : (
                            <pre style={{
                                fontFamily: A.mono, fontSize: 11, color: '#fca5a5',
                                lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                margin: 0,
                            }}>
                                {detail?.content || ''}
                            </pre>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderRadius: 4, gap: 8,
                }}>
                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>
                        Rapor seçin
                    </span>
                </div>
            )}
        </div>
    );
}

// ============================================================
// MAKROLAR PANELİ
// ============================================================
const MACRO_COLORS = [
    '#a78bfa', '#818cf8', '#f472b6', '#f87171',
    '#fbbf24', '#4ade80', '#22d3ee', '#60a5fa',
    '#6b7280', '#374151',
];

function MacroModal({ initial, onClose, onSave }) {
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [commandsText, setCommandsText] = useState((initial?.commands ?? []).join('\n'));
    const [color, setColor] = useState(initial?.color ?? '#a78bfa');

    const handleSave = () => {
        if (!name.trim()) { toast.error('İsim gerekli'); return; }
        const commands = commandsText.split('\n').map(c => c.trim()).filter(Boolean);
        if (commands.length === 0) { toast.error('En az bir komut girin'); return; }
        onSave({ name: name.trim(), description: description.trim(), commands, color });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`,
                borderRadius: 4, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                }}>
                    <Cap>{initial ? 'Makroyu Düzenle' : 'Yeni Makro'}</Cap>
                    <button onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                        <I.X size={16}/>
                    </button>
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <Cap style={{ display: 'block', marginBottom: 6 }}>İsim</Cap>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="örn: Dünya Kaydet"/>
                    </div>
                    <div>
                        <Cap style={{ display: 'block', marginBottom: 6 }}>Açıklama</Cap>
                        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ne yapıyor?"/>
                    </div>
                    <div>
                        <Cap style={{ display: 'block', marginBottom: 6 }}>
                            Komutlar <span style={{ color: A.faintest }}>(her satır bir komut)</span>
                        </Cap>
                        <textarea value={commandsText} onChange={e => setCommandsText(e.target.value)}
                            rows={5} placeholder={'save-all\nsay Sunucu kaydedildi!'}
                            style={{
                                background: A.bg, border: `1px solid ${A.border}`,
                                color: A.text, fontFamily: A.mono, fontSize: 11,
                                padding: '8px 10px', borderRadius: 2, width: '100%',
                                outline: 'none', resize: 'vertical',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                            onBlur={e => e.target.style.borderColor = A.border}
                        />
                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, marginTop: 4, display: 'block' }}>
                            {commandsText.split('\n').filter(c => c.trim()).length} komut · 500ms aralık
                        </span>
                    </div>
                    <div>
                        <Cap style={{ display: 'block', marginBottom: 8 }}>Renk</Cap>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {MACRO_COLORS.map(c => (
                                <button key={c} onClick={() => setColor(c)}
                                    style={{
                                        width: 22, height: 22, borderRadius: 2,
                                        background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                                        cursor: 'pointer',
                                    }}/>
                            ))}
                        </div>
                    </div>
                </div>
                <div style={{
                    display: 'flex', gap: 8, padding: '12px 16px',
                    borderTop: `1px solid ${A.border}`,
                }}>
                    <button onClick={onClose}
                        style={{ ...btnGhost, flex: 1, justifyContent: 'center', fontSize: 12 }}>
                        İptal
                    </button>
                    <button onClick={handleSave}
                        style={{ ...btnPrimary, flex: 1, justifyContent: 'center', fontSize: 12 }}>
                        Kaydet
                    </button>
                </div>
            </div>
        </div>
    );
}

function MacrosPanel({ mcStatus, sendCommand, serverId }) {
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
            await api.post(`/macros/${macro.id}/execute`, { serverId: serverId || null });
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <Cap>Sık kullanılan komutları tek tıkla çalıştır</Cap>
                {isAdmin && (
                    <button onClick={() => setModal('new')}
                        style={{
                            ...btnPrimary, display: 'flex', alignItems: 'center',
                            gap: 6, fontSize: 11, padding: '6px 12px',
                        }}>
                        <I.Plus size={12}/> Yeni Makro
                    </button>
                )}
            </div>

            {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                    <div style={{
                        width: 16, height: 16, border: `2px solid ${A.border}`,
                        borderTopColor: 'var(--accent)', borderRadius: 99,
                        animation: 'hoodoo-spin 0.8s linear infinite',
                    }}/>
                    <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            ) : macros.length === 0 ? (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 10,
                    background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                }}>
                    <I.Stack size={28} style={{ color: A.faintest }}/>
                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>
                        Henüz makro yok
                    </span>
                    {isAdmin && (
                        <span style={{ fontSize: 11, color: A.faint }}>
                            Sağ üstten yeni makro oluşturun
                        </span>
                    )}
                </div>
            ) : (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 10, overflowY: 'auto',
                }}>
                    {macros.map(macro => (
                        <div key={macro.id} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '12px 14px',
                            display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 1, background: macro.color, flexShrink: 0 }}/>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {macro.name}
                                    </span>
                                </div>
                                {isAdmin && (
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button onClick={() => setModal(macro)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 2 }}
                                            onMouseEnter={e => e.currentTarget.style.color = A.text}
                                            onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                            <I.Wrench size={12}/>
                                        </button>
                                        <button onClick={() => { if (window.confirm(`"${macro.name}" silinsin mi?`)) deleteMutation.mutate(macro.id); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 2 }}
                                            onMouseEnter={e => e.currentTarget.style.color = A.err}
                                            onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                            <I.Trash size={12}/>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {macro.description && (
                                <p style={{ fontSize: 11, color: A.faint, lineHeight: 1.5, margin: 0 }}>{macro.description}</p>
                            )}

                            <div style={{
                                background: A.bgDeeper, border: `1px solid ${A.border}`,
                                padding: '8px 10px', borderRadius: 2,
                            }}>
                                {macro.commands.slice(0, 4).map((cmd, i) => (
                                    <div key={i} style={{ fontFamily: A.mono, fontSize: 10, color: A.dim, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <span style={{ color: A.faintest }}>›&nbsp;</span>{cmd}
                                    </div>
                                ))}
                                {macro.commands.length > 4 && (
                                    <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                                        +{macro.commands.length - 4} daha
                                    </div>
                                )}
                            </div>

                            <button onClick={() => executeMacro(macro)}
                                disabled={mcStatus !== 'running' || executing === macro.id}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 6, padding: '7px 0', border: 'none', cursor: 'pointer',
                                    borderRadius: 2, fontSize: 11, fontWeight: 500,
                                    color: '#000', background: macro.color,
                                    opacity: (mcStatus !== 'running' || executing === macro.id) ? 0.4 : 1,
                                    fontFamily: A.sans, letterSpacing: '0.04em',
                                }}>
                                {executing === macro.id ? (
                                    <div style={{
                                        width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)',
                                        borderTopColor: '#000', borderRadius: 99,
                                        animation: 'hoodoo-spin 0.8s linear infinite',
                                    }}/>
                                ) : (
                                    <I.Play size={12}/>
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
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
