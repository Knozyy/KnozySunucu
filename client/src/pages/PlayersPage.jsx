import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap, Dot, Pill, Input } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

const api = (url) => apiClient.get(url).then(r => r.data);

function fmtDuration(seconds) {
    if (!seconds) return '0sn';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}s ${m}d`;
    if (m > 0) return `${m}d ${s}sn`;
    return `${s}sn`;
}

function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} gün önce`;
    if (h > 0) return `${h} saat önce`;
    if (m > 0) return `${m} dk önce`;
    return 'az önce';
}

function PlayerHead({ username, size = 32 }) {
    return (
        <img
            src={`https://mc-heads.net/avatar/${username}/32`}
            alt={username}
            style={{ width: size, height: size, borderRadius: 3, flexShrink: 0 }}
            onError={e => { e.target.src = 'https://mc-heads.net/avatar/steve/32'; }}
        />
    );
}

function Spinner({ size = 16 }) {
    return (
        <div style={{
            width: size, height: size,
            border: `2px solid ${A.border}`,
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'hodo-spin 0.8s linear infinite',
        }}/>
    );
}

function RefreshIcon({ size = 14, spinning }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={spinning ? { animation: 'hodo-spin 0.8s linear infinite' } : undefined}>
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
    );
}

function BanIcon({ size = 14, style: s }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
    );
}

function TrophyIcon({ size = 14, style: s }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
        </svg>
    );
}

export default function PlayersPage() {
    const qc = useQueryClient();
    const [search, setSearch]       = useState('');
    const [activeTab, setActiveTab] = useState('sessions');
    const [profileUser, setProfileUser] = useState(null);

    const { data: online, isFetching: onlineFetching, refetch: refetchOnline } = useQuery({
        queryKey: ['players-online'],
        queryFn: () => api('/players/online'),
        refetchInterval: 5000,
    });

    const { data: sessionsRaw, isLoading: sessionsLoading } = useQuery({
        queryKey: ['player-sessions', search],
        queryFn: () => api(`/players/sessions?limit=500${search ? `&username=${encodeURIComponent(search)}` : ''}`),
        refetchInterval: 15000,
    });

    // Her oyuncunun sadece en son oturumunu göster
    const sessions = (() => {
        const seen = new Map();
        const raw = Array.isArray(sessionsRaw) ? sessionsRaw : [];
        for (const s of raw) {
            if (!seen.has(s.username)) seen.set(s.username, s);
        }
        return Array.from(seen.values());
    })();

    const [selectedArchive, setSelectedArchive] = useState('current');

    const { data: archives = [] } = useQuery({
        queryKey: ['player-stats-archives'],
        queryFn: () => api('/players/stats/archives'),
    });

    const { data: statsRaw, isLoading: statsLoading } = useQuery({
        queryKey: ['player-stats', selectedArchive],
        queryFn: () => selectedArchive === 'current' 
            ? api('/players/stats') 
            : api(`/players/stats/archives/${encodeURIComponent(selectedArchive)}`),
        refetchInterval: selectedArchive === 'current' ? 30000 : false,
    });

    const archiveMutation = useMutation({
        mutationFn: (name) => apiClient.post('/players/stats/archive', { archiveName: name }),
        onSuccess: () => {
            toast.success('İstatistikler arşivlendi!');
            qc.invalidateQueries(['player-stats']);
            qc.invalidateQueries(['player-stats-archives']);
            setSelectedArchive('current');
        },
        onError: (err) => toast.error(err.response?.data?.error || err.message),
    });

    const handleArchive = () => {
        const name = prompt('Bu arşive bir isim verin (Örn: Mayıs 2026):');
        if (name && name.trim()) {
            if (confirm(`Şu anki tüm istatistikler "${name}" başlığı altında arşivlenip SIFIRLANACAKTIR. Emin misiniz?`)) {
                archiveMutation.mutate(name.trim());
            }
        }
    };
    const stats = Array.isArray(statsRaw) ? statsRaw : [];

    const onlinePlayers = online?.players ?? [];
    const mcStatus = online?.status ?? 'stopped';

    const { data: banlogRaw, isLoading: banloading } = useQuery({
        queryKey: ['banlog'],
        queryFn: () => api('/players/banlog'),
        refetchInterval: 30000,
    });
    const banlog = Array.isArray(banlogRaw) ? banlogRaw : [];

    const tabs = [
        { id: 'sessions', label: 'Oturum Geçmişi', icon: <I.Calendar size={12}/> },
        { id: 'stats',    label: 'İstatistikler',  icon: <TrophyIcon size={12}/> },
        { id: 'banlog',   label: 'Ban Günlüğü',    icon: <BanIcon size={12}/> },
        { id: 'notes',    label: 'Oyuncu Notları', icon: <I.Console size={12}/> },
    ];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Başlık ── */}
            <div>
                <Cap>oyuncular</Cap>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                    margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                    Oyuncular
                </h1>
                <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                    Oturum geçmişi ve oyuncu istatistikleri
                </p>
            </div>

            {/* ── Şu An Online ── */}
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '14px 16px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                    paddingBottom: 10, borderBottom: `1px solid ${A.border}`,
                }}>
                    <Dot color={mcStatus === 'running' ? A.ok : A.faint} size={6}/>
                    <Cap style={{ flex: 1 }}>Şu An Online</Cap>
                    <span style={{
                        fontFamily: A.mono, fontSize: 11, color: A.faint,
                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                        padding: '1px 6px', borderRadius: 2,
                    }}>
                        {onlinePlayers.length}
                    </span>
                    <button onClick={() => refetchOnline()} title="Yenile" style={{
                        ...btnGhost, padding: '3px 6px', color: A.faint,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <RefreshIcon size={13} spinning={onlineFetching}/>
                    </button>
                </div>

                {onlinePlayers.length === 0 ? (
                    <p style={{ fontSize: 12, color: A.faint, fontFamily: A.mono, margin: 0 }}>
                        {mcStatus === 'running' ? '— şu an online oyuncu yok' : '— sunucu çalışmıyor'}
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {onlinePlayers.map(p => {
                            const pName = typeof p === 'string' ? p : p.name;
                            return (
                                <div key={pName} onClick={() => setProfileUser(pName)} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: 'rgba(74,222,128,0.06)',
                                    border: '1px solid rgba(74,222,128,0.15)',
                                    borderRadius: 4, padding: '6px 10px',
                                    cursor: 'pointer',
                                }}>
                                    <PlayerHead username={pName} size={24}/>
                                    <span style={{ fontSize: 12, fontWeight: 500, color: A.ok, fontFamily: A.mono }}>
                                        {pName}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Sekmeler ── */}
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${A.border}` }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', fontSize: 11, fontFamily: A.mono,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === tab.id ? A.text : A.dim,
                        borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                        marginBottom: -1, transition: 'color 0.15s',
                    }}>
                        {tab.icon}{tab.label}
                    </button>
                ))}
            </div>

            {/* ── Oturum Geçmişi ── */}
            {activeTab === 'sessions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ position: 'relative', maxWidth: 280 }}>
                        <span style={{
                            position: 'absolute', left: 10, top: '50%',
                            transform: 'translateY(-50%)', color: A.faint, display: 'flex',
                        }}>
                            <I.Search size={13}/>
                        </span>
                        <Input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Oyuncu adı ara..." mono
                            style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}/>
                    </div>

                    <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 16px', borderBottom: `1px solid ${A.border}`,
                        }}>
                            <Cap>Son Oturumlar</Cap>
                            <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                {sessions.length} kayıt
                            </span>
                        </div>

                        {sessionsLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                                <Spinner size={20}/>
                            </div>
                        ) : sessions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                                <I.Users size={28} style={{ color: A.faint, margin: '0 auto 10px', display: 'block' }}/>
                                <p style={{ fontSize: 12, color: A.dim, margin: '0 0 4px' }}>Henüz oturum kaydı yok.</p>
                                <p style={{ fontSize: 11, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                    Bir oyuncu sunucuya girdiğinde burada görünür.
                                </p>
                            </div>
                        ) : (
                            <div>
                                {sessions.map((s, i) => (
                                    <div key={s.id} onClick={() => setProfileUser(s.username)} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 16px',
                                        borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <PlayerHead username={s.username} size={32}/>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: A.text }}>
                                                    {s.username}
                                                </span>
                                                {!s.left_at && (
                                                    <Pill style={{
                                                        background: 'rgba(74,222,128,0.1)',
                                                        color: A.ok,
                                                        border: '1px solid rgba(74,222,128,0.2)',
                                                        fontFamily: A.mono,
                                                    }}>
                                                        online
                                                    </Pill>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                                                {fmtDate(s.joined_at)}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                fontSize: 12, color: A.dim, fontFamily: A.mono,
                                            }}>
                                                <I.Clock size={12} style={{ color: A.faint }}/>
                                                {s.left_at
                                                    ? fmtDuration(s.duration_seconds)
                                                    : <span style={{ color: A.ok }}>aktif</span>
                                                }
                                            </div>
                                            {s.left_at && (
                                                <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                                                    {timeAgo(s.left_at)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── İstatistikler ── */}
            {activeTab === 'stats' && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${A.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                        <Cap>En Fazla Oynayan — Top 20 {selectedArchive !== 'current' && `(${selectedArchive})`}</Cap>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select 
                                value={selectedArchive} 
                                onChange={e => setSelectedArchive(e.target.value)}
                                style={{ background: A.bgDeeper, color: A.text, border: `1px solid ${A.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                            >
                                <option value="current">Mevcut İstatistikler</option>
                                {(archives.data || archives).map(a => (
                                    <option key={a.archive_name} value={a.archive_name}>{a.archive_name}</option>
                                ))}
                            </select>
                            {selectedArchive === 'current' && (
                                <button onClick={handleArchive} disabled={archiveMutation.isLoading} style={{ ...btnGhost, padding: '4px 8px', fontSize: 12, color: A.ok }}>
                                    <I.Calendar size={12} style={{ marginRight: 4 }}/>
                                    Arşive Kaldır ve Sıfırla
                                </button>
                            )}
                        </div>
                    </div>

                    {statsLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                            <Spinner size={20}/>
                        </div>
                    ) : stats.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                            <TrophyIcon size={28} style={{ color: A.faint, margin: '0 auto 10px', display: 'block' }}/>
                            <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>Henüz istatistik yok.</p>
                        </div>
                    ) : (
                        <div>
                            {stats.map((p, idx) => {
                                const maxSeconds = stats[0]?.total_seconds || 1;
                                const pct = Math.round((p.total_seconds / maxSeconds) * 100);
                                const medals = ['🥇', '🥈', '🥉'];
                                return (
                                    <div key={p.username} onClick={() => setProfileUser(p.username)} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 16px',
                                        borderTop: idx > 0 ? `1px solid ${A.border}` : 'none',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <span style={{
                                            width: 24, textAlign: 'center', flexShrink: 0,
                                            fontSize: idx < 3 ? 14 : 10,
                                            color: A.faint, fontFamily: A.mono,
                                        }}>
                                            {idx < 3 ? medals[idx] : `#${idx + 1}`}
                                        </span>
                                        <PlayerHead username={p.username} size={32}/>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: 'space-between', marginBottom: 5,
                                            }}>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: A.text }}>
                                                    {p.username}
                                                </span>
                                                <span style={{ fontSize: 12, fontFamily: A.mono, color: A.dim }}>
                                                    {fmtDuration(p.total_seconds)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    flex: 1, height: 3,
                                                    background: A.bgDeeper, borderRadius: 2, overflow: 'hidden',
                                                }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: 2,
                                                        background: 'var(--accent)',
                                                        width: `${pct}%`, transition: 'width 0.5s',
                                                    }}/>
                                                </div>
                                                <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, flexShrink: 0 }}>
                                                    {p.session_count} oturum
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 3 }}>
                                                Son görülme: {timeAgo(p.last_seen)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'notes' && <PlayerNotesPanel onPlayerClick={setProfileUser} />}

            {/* ── Ban Günlüğü ── */}
            {activeTab === 'banlog' && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', borderBottom: `1px solid ${A.border}`,
                    }}>
                        <Cap>Ban Geçmişi</Cap>
                        <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                            {banlog.length} kayıt
                        </span>
                    </div>

                    {banloading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                            <Spinner size={20}/>
                        </div>
                    ) : banlog.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                            <BanIcon size={28} style={{ color: A.faint, margin: '0 auto 10px', display: 'block' }}/>
                            <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>Ban geçmişi yok.</p>
                        </div>
                    ) : (
                        <div>
                            {banlog.map((b, i) => {
                                const isBan = b.action === 'ban' || b.action === 'ban-ip';
                                return (
                                    <div key={b.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 16px',
                                        borderTop: i > 0 ? `1px solid ${A.border}` : 'none',
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isBan ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                                            color: isBan ? A.err : A.ok,
                                        }}>
                                            {isBan ? <BanIcon size={14}/> : <I.Check size={14}/>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: A.text }}>
                                                    {b.username}
                                                </span>
                                                <Pill style={{
                                                    background: isBan ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                                                    color: isBan ? A.err : A.ok,
                                                    border: `1px solid ${isBan ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}`,
                                                    fontFamily: A.mono, textTransform: 'lowercase',
                                                }}>
                                                    {b.action}
                                                </Pill>
                                            </div>
                                            {b.reason && (
                                                <p style={{
                                                    fontSize: 11, color: A.faint, fontFamily: A.mono,
                                                    margin: '2px 0 0', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    Neden: {b.reason}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: 11, color: A.dim, fontFamily: A.mono }}>
                                                {b.banned_by}
                                            </div>
                                            <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                                                {timeAgo(new Date(b.created_at).getTime())}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {/* ── Oyuncu Profil Modal ── */}
            {profileUser && (
                <PlayerProfileModal username={profileUser} onClose={() => setProfileUser(null)} />
            )}
        </div>
    );
}

function PlayerNotesPanel({ onPlayerClick }) {
    const qc = useQueryClient();
    const [username, setUsername] = useState('');
    const [searched, setSearched] = useState('');
    const [note, setNote] = useState('');

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ['player-notes', searched],
        queryFn: () => searched
            ? apiClient.get(`/players/notes/${encodeURIComponent(searched)}`).then(r => r.data)
            : Promise.resolve([]),
        enabled: !!searched,
    });

    const addMutation = useMutation({
        mutationFn: () => apiClient.post(`/players/notes/${encodeURIComponent(searched)}`, { note }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['player-notes', searched] });
            setNote('');
            toast.success('Not eklendi');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => apiClient.delete(`/players/notes/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['player-notes', searched] });
            toast.success('Not silindi');
        },
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
                    <span style={{
                        position: 'absolute', left: 10, top: '50%',
                        transform: 'translateY(-50%)', color: A.faint, display: 'flex',
                    }}>
                        <I.Search size={13}/>
                    </span>
                    <Input value={username} onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && setSearched(username)}
                        placeholder="Oyuncu adı..." mono
                        style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}/>
                </div>
                <button onClick={() => setSearched(username)} disabled={!username.trim()} style={{
                    ...btnPrimary, padding: '0 16px', fontSize: 11,
                    opacity: !username.trim() ? 0.4 : 1,
                    cursor: !username.trim() ? 'not-allowed' : 'pointer',
                }}>
                    ARA
                </button>
            </div>

            {searched && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                    }}>
                        <PlayerHead username={searched} size={28}/>
                        <span style={{ fontSize: 13, fontWeight: 500, color: A.text }}>{searched}</span>
                    </div>

                    <div style={{
                        padding: '10px 16px', display: 'flex', gap: 8,
                        borderBottom: `1px solid ${A.border}`,
                    }}>
                        <Input value={note} onChange={e => setNote(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && note.trim() && addMutation.mutate()}
                            placeholder="Yeni not ekle..." mono
                            style={{ flex: 1 }}/>
                        <button onClick={() => addMutation.mutate()}
                            disabled={!note.trim() || addMutation.isPending} style={{
                                ...btnPrimary, padding: '0 12px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: (!note.trim() || addMutation.isPending) ? 0.4 : 1,
                                cursor: (!note.trim() || addMutation.isPending) ? 'not-allowed' : 'pointer',
                            }}>
                            <I.Plus size={14}/>
                        </button>
                    </div>

                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                            <Spinner size={16}/>
                        </div>
                    ) : notes.length === 0 ? (
                        <p style={{
                            fontSize: 12, color: A.faint, textAlign: 'center',
                            padding: '20px 16px', margin: 0, fontFamily: A.mono,
                        }}>
                            Bu oyuncu için not yok.
                        </p>
                    ) : (
                        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {notes.map(n => (
                                <div key={n.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '10px 12px',
                                    background: A.bgDeeper, border: `1px solid ${A.border}`,
                                    borderRadius: 4,
                                }}>
                                    <div style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        marginTop: 5, flexShrink: 0,
                                        background: n.color || 'var(--accent)',
                                    }}/>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 12, color: A.text, margin: '0 0 3px' }}>
                                            {n.note}
                                        </p>
                                        <p style={{ fontSize: 10, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                            {n.created_by} · {new Date(n.created_at).toLocaleDateString('tr-TR')}
                                        </p>
                                    </div>
                                    <button onClick={() => deleteMutation.mutate(n.id)} style={{
                                        ...btnGhost, padding: '2px 4px', color: A.faint,
                                        display: 'flex', alignItems: 'center',
                                    }}>
                                        <I.Trash size={12}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================
// OYUNCU PROFİL MODALI
// ============================================================
function PlayerProfileModal({ username, onClose }) {
    const qc = useQueryClient();
    const [tab, setTab] = useState('overview');

    const { data: profile, isLoading } = useQuery({
        queryKey: ['player-profile', username],
        queryFn: () => apiClient.get(`/players/profile/${encodeURIComponent(username)}`).then(r => r.data),
    });

    const { data: notes = [], refetch: refetchNotes } = useQuery({
        queryKey: ['player-notes', username],
        queryFn: () => apiClient.get(`/players/notes/${encodeURIComponent(username)}`).then(r => r.data),
    });

    const [note, setNote] = useState('');
    const addNote = useMutation({
        mutationFn: () => apiClient.post(`/players/notes/${encodeURIComponent(username)}`, { note }),
        onSuccess: () => { refetchNotes(); setNote(''); toast.success('Not eklendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const delNote = useMutation({
        mutationFn: (id) => apiClient.delete(`/players/notes/${id}`),
        onSuccess: () => refetchNotes(),
    });

    const banMutation = useMutation({
        mutationFn: (reason) => apiClient.post('/players/ban', { name: username, reason }),
        onSuccess: () => { toast.success(`${username} banlandı`); qc.invalidateQueries({ queryKey: ['banlog'] }); onClose(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const handleBan = () => {
        const reason = window.prompt(`${username} için ban sebebi:`);
        if (reason !== null) banMutation.mutate(reason);
    };

    const tabs = [
        { id: 'overview', label: 'GENEL' },
        { id: 'sessions', label: 'OTURUMLAR' },
        { id: 'notes',    label: 'NOTLAR' },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 70,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: 16,
        }} onClick={onClose}>
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                width: '100%', maxWidth: 640, maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '14px 18px', borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
                }}>
                    <PlayerHead username={username} size={40}/>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: A.text }}>{username}</span>
                            {profile?.isOnline && (
                                <Pill color={A.ok} bg="rgba(74,222,128,0.1)">● online</Pill>
                            )}
                        </div>
                        <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, marginTop: 2 }}>
                            {profile?.sessionCount || 0} oturum · Son görülme: {timeAgo(profile?.lastSeen ? new Date(profile.lastSeen).getTime() : null)}
                        </div>
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleBan} style={{
                            ...btnGhost, fontSize: 10, padding: '4px 10px',
                            color: A.err, borderColor: 'rgba(248,113,113,0.25)',
                        }}>
                            🚫 BAN
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                            <I.X size={16}/>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${A.border}`, flexShrink: 0 }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{
                            padding: '8px 16px', background: 'none', border: 'none',
                            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                            cursor: 'pointer', fontFamily: A.mono, fontSize: 10,
                            letterSpacing: '0.08em', color: tab === t.id ? A.text : A.dim,
                            marginBottom: -1, transition: 'color 0.15s',
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                            <Spinner size={24}/>
                        </div>
                    ) : tab === 'overview' ? (
                        <ProfileOverview profile={profile}/>
                    ) : tab === 'sessions' ? (
                        <ProfileSessions sessions={profile?.sessions || []}/>
                    ) : (
                        <ProfileNotes
                            notes={notes} note={note} setNote={setNote}
                            onAdd={() => addNote.mutate()} onDelete={id => delNote.mutate(id)}
                            adding={addNote.isPending}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function ProfileOverview({ profile }) {
    if (!profile) return null;
    const mc = profile.mcStats || {};

    const stat = (label, value) => (
        <div style={{
            background: A.bgDeeper, border: `1px solid ${A.border}`,
            borderRadius: 3, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 3,
        }}>
            <span style={{ fontFamily: A.mono, fontSize: 9, color: A.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: A.text, fontFamily: A.mono }}>{value ?? '—'}</span>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Zaman istatistikleri */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {stat('Toplam Oynama', fmtDuration(profile.totalSeconds))}
                {stat('Oturum Sayısı', profile.sessionCount)}
                {stat('İlk Görülme', profile.firstSeen ? new Date(profile.firstSeen).toLocaleDateString('tr-TR') : '—')}
                {stat('Son Görülme', profile.lastSeen ? new Date(profile.lastSeen).toLocaleDateString('tr-TR') : '—')}
            </div>

            {/* MC stats — yalnızca varsa */}
            {Object.keys(mc).length > 0 && (
                <>
                    <Cap>Minecraft İstatistikleri</Cap>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {stat('Ölüm', mc.deaths)}
                        {stat('Oyuncu Öldürme', mc.playerKills)}
                        {stat('Mob Öldürme', mc.mobKills)}
                        {stat('Blok Kırma', mc.blocksMined?.toLocaleString())}
                        {stat('Blok Yerleştirme', mc.blocksPlaced?.toLocaleString())}
                        {stat('Yürüme (m)', mc.distanceWalked?.toLocaleString())}
                    </div>
                </>
            )}

            {Object.keys(mc).length === 0 && (
                <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faint, textAlign: 'center', padding: '12px 0' }}>
                    MC istatistikleri bulunamadı (sunucu yolu veya UUID eksik olabilir)
                </div>
            )}
        </div>
    );
}

function ProfileSessions({ sessions }) {
    if (!sessions.length) return (
        <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: A.mono, fontSize: 11, color: A.faint }}>
            Oturum kaydı yok
        </div>
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sessions.map((s, i) => (
                <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 3,
                    background: i % 2 === 0 ? A.bgDeeper : 'transparent',
                }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontFamily: A.mono, fontSize: 11, color: A.text }}>
                            {fmtDate(s.joined_at)}
                        </span>
                        {!s.left_at && (
                            <Pill color={A.ok} bg="rgba(74,222,128,0.1)" style={{ marginLeft: 8 }}>aktif</Pill>
                        )}
                    </div>
                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.dim }}>
                        {s.left_at ? fmtDuration(s.duration_seconds) : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
}

function ProfileNotes({ notes, note, setNote, onAdd, onDelete, adding }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <Input value={note} onChange={e => setNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && note.trim() && onAdd()}
                    placeholder="Yeni not ekle..." mono style={{ flex: 1 }}/>
                <button onClick={onAdd} disabled={!note.trim() || adding} style={{
                    ...btnPrimary, padding: '0 12px', display: 'flex', alignItems: 'center',
                    opacity: (!note.trim() || adding) ? 0.4 : 1,
                }}>
                    <I.Plus size={14}/>
                </button>
            </div>
            {notes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', fontFamily: A.mono, fontSize: 11, color: A.faint }}>
                    Not yok
                </div>
            ) : (
                notes.map(n => (
                    <div key={n.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px', background: A.bgDeeper,
                        border: `1px solid ${A.border}`, borderRadius: 3,
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.color || 'var(--accent)' }}/>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, color: A.text, margin: '0 0 3px' }}>{n.note}</p>
                            <p style={{ fontSize: 10, color: A.faint, margin: 0, fontFamily: A.mono }}>
                                {n.created_by} · {new Date(n.created_at).toLocaleDateString('tr-TR')}
                            </p>
                        </div>
                        <button onClick={() => onDelete(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 2 }}>
                            <I.Trash size={12}/>
                        </button>
                    </div>
                ))
            )}
        </div>
    );
}
