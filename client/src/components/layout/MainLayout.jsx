import { useState, useEffect, useRef } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { A, btnGhost } from '@/knozy/tokens';
import { Cap, Dot, NavItem, TickStat } from '@/knozy/primitives';
import { I } from '@/knozy/icons';
import { PAGES } from '@/config/pages';

// ── Panel yeniden başlama banner'ı ──────────────────────────────────────
function useUpdateBanner() {
    const [showBanner, setShowBanner] = useState(false);
    const knownStartTime = useRef(null);
    const wasOffline = useRef(false);

    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('/api/health');
                if (!res.ok) throw new Error('not ok');
                const data = await res.json();
                if (knownStartTime.current === null) knownStartTime.current = data.startTime;
                else if (data.startTime !== knownStartTime.current) setShowBanner(true);
                else if (wasOffline.current) setShowBanner(true);
                wasOffline.current = false;
            } catch {
                wasOffline.current = true;
            }
        };
        check();
        const id = setInterval(check, 30000);
        return () => clearInterval(id);
    }, []);

    return showBanner;
}

// ── Saat ────────────────────────────────────────────────────────────────
function useClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

// ── Birincil sunucu (topbar için) ───────────────────────────────────────
function usePrimaryServer() {
    const { data } = useQuery({
        queryKey: ['servers-status-topbar'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });
    const servers = data?.servers || [];
    return servers[0] || { id: null, name: 'knozy-panel', status: 'stopped', playerCount: 0,
        processStats: { cpuPercent: 0, memoryMB: 0 }, tps: null, maxRamGB: 4 };
}

// Nav + erişim, tek kaynaktan (config/pages.js) gelir.
// Bir sayfa görünür mü? → always: herkes · adminOnly: yalnız admin · diğer: canAccess(key)
function pageVisible(page, user, canAccess) {
    if (page.always) return true;
    if (page.adminOnly) return user?.role === 'admin';
    return canAccess(page.key);
}

export default function MainLayout() {
    const showBanner = useUpdateBanner();
    const navigate = useNavigate();
    const location = useLocation();
    const qc = useQueryClient();
    const { user, logout, canAccess } = useAuth();
    const server = usePrimaryServer();
    const clock = useClock();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Sayfa değişince mobil menüyü kapat
    useEffect(() => { setMobileOpen(false); }, [location.pathname]);

    const cpu = server.processStats?.cpuPercent ?? 0;
    const ramMB = server.processStats?.memoryMB ?? 0;
    const maxRamGB = server.maxRamGB || 4;
    const ramPct = Math.min(100, (ramMB / (maxRamGB * 1024)) * 100);
    const playerCount = server.playerCount ?? 0;
    const maxPlayers = server.connection?.maxPlayers || 20;
    const tps = server.tps;
    const isRunning  = server.status === 'running';
    const isStarting = server.status === 'starting';
    const isStopping = server.status === 'stopping';

    const startM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/start`),
        onSuccess: () => { toast.success('Başlatılıyor...'); qc.invalidateQueries({ queryKey: ['servers-status-topbar'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const stopM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/stop`),
        onSuccess: () => { toast.success('Durduruluyor...'); qc.invalidateQueries({ queryKey: ['servers-status-topbar'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const restartM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/restart`),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); qc.invalidateQueries({ queryKey: ['servers-status-topbar'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    // Durum Tespiti: panel ile gerçek sunucu durumu uyuşmazsa senkronlar
    // (çökme sonrası elle açılan / butonun kilitlendiği durumları onarır).
    const reconcileM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/reconcile`),
        onSuccess: (res) => { toast.success(res.data?.message || 'Durum senkronlandı'); qc.invalidateQueries({ queryKey: ['servers-status-topbar'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    // Görünür sayfalar (izne göre) + mevcut rota erişim denetimi
    const visiblePages = PAGES.filter(p => pageVisible(p, user, canAccess));
    const currentPage = PAGES.find(n =>
        n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path)
    );
    const currentLabel = currentPage?.label || 'Panel';
    // İzinsiz bir rotaya doğrudan URL ile gelinirse ana panele yönlendir
    const accessDenied = currentPage && !pageVisible(currentPage, user, canAccess);

    return (
        <div style={{
            minHeight: '100vh',
            background: A.bg,
            color: A.text,
            fontFamily: A.sans,
            display: 'flex',
            position: 'relative',
        }}>
            <style>{`
                @media (max-width: 768px) {
                    .knozy-sidebar {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        height: 100vh !important;
                        z-index: 40 !important;
                        transform: translateX(-100%);
                        transition: transform 200ms ease !important;
                        width: 220px !important;
                    }
                    .knozy-sidebar.open {
                        transform: translateX(0) !important;
                    }
                    .knozy-sidebar-overlay {
                        display: block !important;
                    }
                    .knozy-main {
                        margin-left: 0 !important;
                    }
                    .knozy-topbar-metrics {
                        display: none !important;
                    }
                    .knozy-topbar-sep {
                        display: none !important;
                    }
                    .knozy-hamburger {
                        display: flex !important;
                    }
                    .knozy-topbar-clock {
                        display: none !important;
                    }
                }
                @media (min-width: 769px) {
                    .knozy-hamburger { display: none !important; }
                    .knozy-sidebar-overlay { display: none !important; }
                }
            `}</style>

            {showBanner && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
                    background: A.panel, borderBottom: `1px solid var(--accent)`,
                    padding: '8px 16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: A.mono, fontSize: 12,
                }}>
                    <span style={{ color: A.text }}>
                        <span style={{ color: 'var(--accent)' }}>● </span>
                        Panel güncellendi veya sunucu yeniden başladı. Yenileyin.
                    </span>
                    <button onClick={() => window.location.reload()}
                        style={{ ...btnGhost, color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                        Yenile
                    </button>
                </div>
            )}

            {/* ── Mobile overlay ── */}
            <div className="knozy-sidebar-overlay" onClick={() => setMobileOpen(false)} style={{
                display: 'none',
                position: 'fixed', inset: 0, zIndex: 39,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
            }}/>

            {/* ── Sidebar ── */}
            <aside className={`knozy-sidebar${mobileOpen ? ' open' : ''}`} style={{
                width: collapsed ? 56 : 208,
                background: A.bgDeeper,
                borderRight: `1px solid ${A.border}`,
                display: 'flex',
                flexDirection: 'column',
                flex: 'none',
                position: 'sticky',
                top: 0,
                height: '100vh',
                transition: 'width 200ms ease',
            }}>
                {/* Logo */}
                <div style={{
                    padding: collapsed ? '18px 0' : '18px 18px',
                    borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    cursor: 'pointer',
                }} onClick={() => setCollapsed(c => !c)}>
                    <div style={{
                        width: 22, height: 22, background: 'var(--accent)',
                        position: 'relative', borderRadius: 1, flex: 'none',
                    }}>
                        <div style={{ position: 'absolute', inset: 4, background: A.bg }}/>
                        <div style={{ position: 'absolute', inset: 8, background: 'var(--accent)' }}/>
                    </div>
                    {!collapsed && (
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', color: A.text }}>Knozy</div>
                            <div style={{ fontSize: 9, color: A.faint, fontFamily: A.mono, letterSpacing: '0.08em' }}>SERVER PANEL</div>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav style={{
                    padding: '10px 0', flex: 1,
                    display: 'flex', flexDirection: 'column', gap: 1,
                    overflowY: 'auto',
                }}>
                    {visiblePages.map(n => (
                        <NavItem key={n.key}
                            icon={n.icon}
                            label={n.label}
                            badge={n.badge}
                            active={
                                n.path === '/'
                                    ? location.pathname === '/'
                                    : location.pathname.startsWith(n.path)
                            }
                            onClick={() => navigate(n.path)}
                            collapsed={collapsed}/>
                    ))}
                </nav>

                {/* User footer */}
                {!collapsed && user && (
                    <div style={{
                        borderTop: `1px solid ${A.border}`, padding: '10px 14px',
                        display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: 2, background: 'var(--accent)',
                                display: 'grid', placeItems: 'center', color: A.bg,
                                fontFamily: A.mono, fontWeight: 700, fontSize: 11,
                                flex: 'none',
                            }}>{(user.username || '?').slice(0, 1).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
                                <div style={{
                                    fontSize: 9, color: user.role === 'admin' ? A.warn : A.faint,
                                    fontFamily: A.mono, letterSpacing: '0.06em',
                                }}>{(user.role || 'user').toUpperCase()}</div>
                            </div>
                        </div>
                        <button onClick={logout} style={{
                            background: A.bgDeeper, border: `1px solid ${A.border}`,
                            color: A.dim, fontFamily: A.mono, fontSize: 10,
                            padding: '8px 10px', borderRadius: 2, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            transition: 'all 120ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = A.err; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = A.dim;  e.currentTarget.style.borderColor = A.border; }}>
                            <I.Logout size={12}/> Çıkış Yap
                        </button>
                    </div>
                )}
                {/* Collapsed mod: küçük buton */}
                {collapsed && user && (
                    <div style={{ borderTop: `1px solid ${A.border}`, padding: '10px 0', display: 'flex', justifyContent: 'center' }}>
                        <button onClick={logout} title="Çıkış Yap"
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: A.faint, padding: 6, borderRadius: 2,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = A.err; }}
                            onMouseLeave={e => { e.currentTarget.style.color = A.faint; }}>
                            <I.Logout size={16}/>
                        </button>
                    </div>
                )}
            </aside>

            {/* ── Main column ── */}
            <div className="knozy-main" style={{
                flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
                paddingTop: showBanner ? 38 : 0,
            }}>
                {/* Top bar */}
                <div style={{
                    height: 48,
                    borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center',
                    padding: '0 16px', gap: 12,
                    background: A.bgTop,
                    position: 'sticky',
                    top: showBanner ? 38 : 0,
                    zIndex: 10,
                }}>
                    {/* Hamburger (mobile only) */}
                    <button className="knozy-hamburger" onClick={() => setMobileOpen(o => !o)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: A.faint, padding: 4, display: 'flex', alignItems: 'center',
                    }}>
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cap>{currentLabel}</Cap>
                        <span style={{ color: A.faintest }}>/</span>
                        <span style={{ fontSize: 13, color: A.text, fontFamily: A.mono }}>
                            {server.name || 'knozy-panel'}
                        </span>
                    </div>

                    <div style={{ flex: 1 }}/>

                    {/* Live metrics — desktop only */}
                    <div className="knozy-topbar-metrics" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <TickStat label="CPU" value={`${cpu.toFixed(0)}%`} ok={cpu < 70}/>
                        <TickStat label="RAM" value={`${ramPct.toFixed(0)}%`} ok={ramPct < 80}/>
                        <TickStat label="TPS" value={tps != null ? tps.toFixed(2) : '—'} ok={tps == null || tps >= 19}/>
                        <TickStat label="PL"  value={`${playerCount}/${maxPlayers}`} ok/>
                    </div>

                    <div className="knozy-topbar-sep" style={{ width: 1, height: 24, background: A.border }}/>

                    {/* Sunucu kontrol butonları */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isRunning || isStarting ? (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '5px 11px', borderRadius: 2,
                                background: 'rgba(74,222,128,0.10)', color: A.ok,
                                fontSize: 10.5, fontFamily: A.mono, letterSpacing: '0.08em', fontWeight: 600,
                            }}>
                                <Dot color={A.ok} size={6}/>
                                {isStarting ? 'BAŞLIYOR' : 'ÇALIŞIYOR'}
                            </span>
                        ) : (
                            <button onClick={() => server.id && startM.mutate()}
                                disabled={!server.id || startM.isPending}
                                style={{
                                    ...btnGhost, color: A.ok, borderColor: 'rgba(74,222,128,0.25)',
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                }}>
                                <I.Play size={10}/>BAŞLAT
                            </button>
                        )}
                        <button onClick={() => server.id && stopM.mutate()}
                            disabled={!server.id || !isRunning || stopM.isPending}
                            style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: !isRunning ? 0.4 : 1 }}>
                            <I.Stop size={10}/>STOP
                        </button>
                        <button onClick={() => server.id && restartM.mutate()}
                            disabled={!server.id || !isRunning || restartM.isPending}
                            style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: !isRunning ? 0.4 : 1 }}>
                            <I.Restart size={10}/>RESTART
                        </button>
                        {isStopping && (
                            <span style={{ fontSize: 10, color: A.warn, fontFamily: A.mono, marginLeft: 6 }}>
                                DURUYOR…
                            </span>
                        )}
                        <button onClick={() => server.id && reconcileM.mutate()}
                            disabled={!server.id || reconcileM.isPending}
                            title="Durum Tespiti — panel ile gerçek sunucu durumunu senkronlar (buton kilitlenince kullanın)"
                            style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <I.Restart size={10}/>{reconcileM.isPending ? 'TESPİT…' : 'DURUM TESPİTİ'}
                        </button>
                    </div>

                    <div className="knozy-topbar-sep" style={{ width: 1, height: 24, background: A.border }}/>

                    <div className="knozy-topbar-clock" style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>
                        {clock.toTimeString().slice(0, 8)}
                    </div>
                </div>

                {/* Page content — izinsiz rotada ana panele yönlendir */}
                <main style={{ flex: 1, padding: 16, minWidth: 0, overflow: 'visible' }}>
                    {accessDenied ? <Navigate to="/" replace /> : <Outlet/>}
                </main>
            </div>
        </div>
    );
}
