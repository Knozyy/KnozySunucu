import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap, Num, Dot, Pill, Input } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [isSetupMode, setIsSetupMode] = useState(false);
    const [clock, setClock] = useState(new Date());

    const { login, register, checkAdmin, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) { navigate('/'); return; }
        const verifyDb = async () => {
            try {
                const hasAdmin = await checkAdmin();
                setIsSetupMode(!hasAdmin);
            } catch (err) {
                console.error('DB kontrol hatası:', err);
            } finally {
                setCheckingAuth(false);
            }
        };
        verifyDb();
    }, [user, navigate, checkAdmin]);

    useEffect(() => {
        const id = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isSetupMode) {
                await register(username, password);
                await login(username, password);
                navigate('/');
            } else {
                await login(username, password);
                navigate('/');
            }
        } catch (err) {
            setError(err.response?.data?.error || (isSetupMode ? 'Kayıt başarısız' : 'Giriş başarısız'));
        } finally {
            setLoading(false);
        }
    };

    if (checkingAuth) {
        return (
            <div style={{
                minHeight: '100vh', background: A.bg, color: A.text,
                fontFamily: A.sans, display: 'grid', placeItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: A.faint }}>
                    <div style={{
                        width: 16, height: 16, border: `2px solid ${A.border}`,
                        borderTopColor: 'var(--accent)', borderRadius: 99,
                        animation: 'hodo-spin 0.8s linear infinite',
                    }}/>
                    <span style={{ fontFamily: A.mono, fontSize: 12 }}>Bağlanılıyor...</span>
                </div>
                <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh', background: A.bg, color: A.text,
            fontFamily: A.sans, display: 'grid', gridTemplateColumns: '1fr 480px',
        }}>
            {/* ── Sol: brand + sistem durumu ── */}
            <div style={{
                padding: '40px 56px', display: 'flex', flexDirection: 'column',
                gap: 40, borderRight: `1px solid ${A.border}`,
                background: A.bgDeeper,
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 32, height: 32, background: 'var(--accent)',
                        position: 'relative', borderRadius: 1, flex: 'none',
                    }}>
                        <div style={{ position: 'absolute', inset: 6, background: A.bg }}/>
                        <div style={{ position: 'absolute', inset: 12, background: 'var(--accent)' }}/>
                    </div>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>HODO</div>
                        <div style={{ fontSize: 10, color: A.faint, fontFamily: A.mono, letterSpacing: '0.12em' }}>
                            SERVER CONTROL PANEL
                        </div>
                    </div>
                </div>

                {/* Hero */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 40 }}>
                    <Cap style={{ fontSize: 11 }}>knozy / minecraft</Cap>
                    <h1 style={{
                        fontSize: 38, lineHeight: 1.15, fontWeight: 600,
                        color: A.text, letterSpacing: '-0.02em', margin: 0,
                    }}>
                        Sunucunuzu<br/>
                        <span style={{ color: 'var(--accent)' }}>tek panelden</span> yönetin.
                    </h1>
                    <p style={{
                        fontSize: 14, color: A.dim, lineHeight: 1.6,
                        maxWidth: 440, marginTop: 8,
                    }}>
                        Çoklu sunucu, canlı konsol, modpack yönetimi,
                        zamanlanmış görevler, oyuncu izleme — hepsi tek bir
                        koyu temalı, veri yoğun arayüzde.
                    </p>
                </div>

                {/* Sistem durumu */}
                <div style={{
                    background: A.panel, border: `1px solid ${A.border}`,
                    padding: 16, borderRadius: 4,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 12, paddingBottom: 10,
                        borderBottom: `1px solid ${A.border}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Dot color={A.ok} size={6}/>
                            <Cap>Sistem durumu</Cap>
                        </div>
                        <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>
                            {clock.toTimeString().slice(0, 8)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <SysRow label="api" status="online" detail="200 OK · 12ms"/>
                        <SysRow label="db" status="online" detail="sqlite · ready"/>
                        <SysRow label="ws" status="online" detail="/ws/console · /ws/terminal"/>
                        <SysRow label="ver" status="info"   detail="hodo-panel v2.0"/>
                    </div>
                </div>

                <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, letterSpacing: '0.04em' }}>
                    © 2026 hodo · knozy.dev
                </div>
            </div>

            {/* ── Sağ: form ── */}
            <div style={{
                padding: '40px 48px', display: 'flex', flexDirection: 'column',
                justifyContent: 'center',
            }}>
                <div style={{ maxWidth: 360, width: '100%', margin: '0 auto' }}>
                    <Cap style={{ fontSize: 10 }}>
                        {isSetupMode ? 'İlk kurulum' : 'Giriş'}
                    </Cap>
                    <h2 style={{
                        fontSize: 26, fontWeight: 600, color: A.text,
                        marginTop: 6, marginBottom: 8, letterSpacing: '-0.01em',
                    }}>
                        {isSetupMode ? 'Admin oluştur' : 'Hoş geldin'}
                    </h2>
                    <p style={{ fontSize: 13, color: A.dim, lineHeight: 1.5, marginBottom: 28 }}>
                        {isSetupMode
                            ? 'Sistemde henüz admin yok. İlk yöneticiyi şimdi oluştur.'
                            : 'Sunucu paneline erişmek için kimlik bilgilerini gir.'}
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <Cap style={{ marginBottom: 6, display: 'block' }}>Kullanıcı adı</Cap>
                            <Input value={username} onChange={(e) => setUsername(e.target.value)}
                                mono placeholder="knozy"/>
                        </div>
                        <div>
                            <Cap style={{ marginBottom: 6, display: 'block' }}>Şifre</Cap>
                            <Input type="password" value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                mono placeholder="••••••••"/>
                        </div>

                        {error && (
                            <div style={{
                                background: 'rgba(248,113,113,0.06)',
                                border: `1px solid rgba(248,113,113,0.2)`,
                                color: A.err, fontFamily: A.mono, fontSize: 11,
                                padding: '8px 12px', borderRadius: 2,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <I.Alert size={12}/>
                                {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading || !username || !password}
                            style={{
                                ...btnPrimary, padding: '10px 16px', fontSize: 12,
                                marginTop: 6, opacity: (loading || !username || !password) ? 0.5 : 1,
                                cursor: (loading || !username || !password) ? 'not-allowed' : 'pointer',
                            }}>
                            {loading
                                ? (isSetupMode ? 'OLUŞTURULUYOR...' : 'GİRİŞ YAPILIYOR...')
                                : (isSetupMode ? 'ADMIN OLUŞTUR' : 'GİRİŞ YAP')}
                        </button>
                    </form>

                    <div style={{
                        marginTop: 32, paddingTop: 20,
                        borderTop: `1px solid ${A.border}`,
                        fontSize: 11, color: A.faint, fontFamily: A.mono, lineHeight: 1.6,
                    }}>
                        <div>
                            {isSetupMode ? '✓ ' : '↑ '}
                            {isSetupMode ? 'Bu kullanıcı süperadmin olarak atanacak.' : 'Şifrenizi unuttuysanız admin ile iletişime geçin.'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SysRow({ label, status, detail }) {
    const c = status === 'online' ? A.ok : status === 'error' ? A.err : A.faint;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: A.mono }}>
            <Dot color={c} size={5}/>
            <span style={{ color: A.dim, letterSpacing: '0.06em', minWidth: 32 }}>{label.toUpperCase()}</span>
            <span style={{ color: c, letterSpacing: '0.04em' }}>{status.toUpperCase()}</span>
            <span style={{ flex: 1 }}/>
            <span style={{ color: A.faint }}>{detail}</span>
        </div>
    );
}
