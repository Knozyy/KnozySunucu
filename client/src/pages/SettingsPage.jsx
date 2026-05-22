import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap, Dot, Pill, Input } from '@/hodo/primitives';
import { I } from '@/hodo/icons';
import { usePushSubscription } from '@/hooks/usePushSubscription';

// ── Tüm izin verilebilir sayfalar ────────────────────────────────────────
const ALL_PAGES = [
    { key: 'dashboard',   label: 'Ana Panel',    emoji: '🏠' },
    { key: 'console',     label: 'Konsol',       emoji: '💻' },
    { key: 'terminal',    label: 'Terminal',      emoji: '⌨️' },
    { key: 'players',     label: 'Oyuncular',    emoji: '👥' },
    { key: 'worlds',      label: 'Dünyalar',     emoji: '🌍' },
    { key: 'files',       label: 'Dosyalar',     emoji: '📁' },
    { key: 'modpacks',    label: 'Modpackler',   emoji: '📦' },
    { key: 'mods',        label: 'Modlar',       emoji: '🧩' },
    { key: 'logs',        label: 'Loglar',       emoji: '📋' },
    { key: 'performance', label: 'Performans',   emoji: '📊' },
    { key: 'scheduler',   label: 'Görevler',     emoji: '⏰' },
    { key: 'automation',  label: 'Otomasyon',    emoji: '🤖' },
    { key: 'backup',      label: 'Yedekleme',    emoji: '💾' },
    { key: 'discord',     label: 'Discord Bot',  emoji: '🎮' },
    { key: 'server',      label: 'Sunucu Bilgi', emoji: '🖥️' },
];

const PRESET_COLORS = ['#a78bfa', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#8b5cf6', '#ec4899', '#14b8a6'];

// ── Spinner ───────────────────────────────────────────────────────────────
function Spinner({ size = 14 }) {
    return (
        <>
            <div style={{
                width: size, height: size,
                border: `2px solid ${A.border}`, borderTopColor: 'var(--accent)',
                borderRadius: 99, animation: 'hodo-spin 0.8s linear infinite',
            }}/>
            <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}

// ── Hodo Modal ─────────────────────────────────────────────────────────────
function HodoModal({ children, onClose, maxWidth = 520 }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: 16,
        }} onClick={onClose}>
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`,
                borderRadius: 4, width: '100%', maxWidth,
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

function HodoModalHeader({ title, onClose }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${A.border}`, flexShrink: 0,
        }}>
            <Cap style={{ fontSize: 11 }}>{title}</Cap>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                <I.X size={14}/>
            </button>
        </div>
    );
}

// ── Hodo table ─────────────────────────────────────────────────────────────
const tblStyle = {
    width: '100%', borderCollapse: 'collapse',
    fontFamily: A.sans, fontSize: 12,
};
const thStyle = {
    padding: '8px 14px', background: A.bgDeeper,
    color: A.faint, fontSize: 10, fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    borderBottom: `1px solid ${A.border}`, textAlign: 'left',
};
const tdStyle = {
    padding: '9px 14px', borderBottom: `1px solid ${A.border}`,
    color: A.dim, verticalAlign: 'middle',
};

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('server');

    const tabs = [
        { id: 'server',     label: 'Sunucu',               icon: I.CPU },
        { id: 'tasks',      label: 'Görev Yöneticisi',     icon: I.CPU },
        { id: 'users',      label: 'Kullanıcılar',          icon: I.Users },
        { id: 'categories', label: 'İzin Kategorileri',     icon: I.Stack },
        { id: 'tokens',     label: 'API Tokenları',          icon: I.Signal },
        { id: 'templates',  label: 'Şablonlar',              icon: I.Archive },
        { id: 'alerts',     label: 'Kaynak Uyarıları',       icon: I.Alert },
        { id: 'audit',      label: 'Audit Log',              icon: I.Folder },
        { id: 'push',       label: 'Tarayıcı Bildirimleri',  icon: I.Signal },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <I.Cog size={16} style={{ color: 'var(--accent)' }}/>
                <Cap style={{ fontSize: 11 }}>Ayarlar</Cap>
            </div>

            {/* Sekmeler */}
            <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', border: 'none', cursor: 'pointer',
                            fontFamily: A.sans, fontSize: 12, borderRadius: 2,
                            whiteSpace: 'nowrap', flexShrink: 0,
                            background: activeTab === tab.id ? A.panel : 'transparent',
                            color: activeTab === tab.id ? A.text : A.dim,
                            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                        }}>
                        <tab.icon size={13}/> {tab.label}
                    </button>
                ))}
            </div>

            {/* Sekme içerikleri */}
            {activeTab === 'server'     && <ServerSettingsPanel/>}
            {activeTab === 'tasks'      && <TaskManagerPanel/>}
            {activeTab === 'users'      && <PanelUsersPanel/>}
            {activeTab === 'categories' && <CategoriesPanel/>}
            {activeTab === 'tokens'     && <ApiTokensPanel/>}
            {activeTab === 'templates'  && <TemplatesPanel/>}
            {activeTab === 'alerts'     && <AlertsPanel/>}
            {activeTab === 'audit'      && <AuditLogPanel/>}
            {activeTab === 'push'       && <PushNotificationTab/>}
        </div>
    );
}

// ============================================================
// SUNUCU AYARLARI (Oto-Yeniden Başlatma vb.)
// ============================================================
function ServerSettingsPanel() {
    const qc = useQueryClient();

    const { data: arData, isLoading: arLoading } = useQuery({
        queryKey: ['auto-restart-setting'],
        queryFn: () => api.get('/servers/auto-restart').then(r => r.data),
    });

    const arMutation = useMutation({
        mutationFn: (enabled) => api.post('/servers/auto-restart', { enabled }),
        onSuccess: (_, enabled) => {
            qc.invalidateQueries({ queryKey: ['auto-restart-setting'] });
            toast.success(enabled ? 'Otomatik yeniden başlatma aktif' : 'Otomatik yeniden başlatma kapalı');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Ayar kaydedilemedi'),
    });

    const enabled = arData?.enabled ?? true;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
            <Cap>Sunucu Davranış Ayarları</Cap>

            {/* Oto-Restart Toggle */}
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                padding: '16px', display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: A.text, fontWeight: 500, marginBottom: 4 }}>
                            Otomatik Yeniden Başlatma
                        </div>
                        <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, lineHeight: 1.6 }}>
                            Sunucu beklenmedik şekilde kapanırsa 10 saniye sonra otomatik olarak yeniden başlatılır.
                            Kasıtlı durdurmalar bu kurala dahil değildir.
                        </div>
                    </div>
                    <button
                        disabled={arLoading || arMutation.isPending}
                        onClick={() => arMutation.mutate(!enabled)}
                        style={{
                            width: 44, height: 24, borderRadius: 99, border: 'none',
                            cursor: arLoading ? 'not-allowed' : 'pointer',
                            background: enabled ? 'var(--accent)' : A.border,
                            position: 'relative', flexShrink: 0, marginLeft: 16,
                            transition: 'background 0.2s',
                            opacity: arMutation.isPending ? 0.6 : 1,
                        }}
                    >
                        <span style={{
                            position: 'absolute', top: 3, left: enabled ? 22 : 3,
                            width: 18, height: 18, borderRadius: 99,
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}/>
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Dot color={enabled ? A.ok : A.faint} size={6}/>
                    <span style={{ fontFamily: A.mono, fontSize: 10, color: enabled ? A.ok : A.faint }}>
                        {arLoading ? 'Yükleniyor...' : enabled ? 'AKTİF — Çöküş sonrası otomatik başlatma açık' : 'PASİF — Sunucu çökerse manuel başlatma gerekir'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// TARAYICI BİLDİRİMLERİ
// ============================================================
function PushNotificationTab() {
    const { subscribed, permission, loading, supported, vapidKey, subscribe, unsubscribe, error } = usePushSubscription();

    if (!supported) {
        return (
            <div style={{
                background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                padding: 20, color: A.faint, fontSize: 12, fontFamily: A.mono,
            }}>
                Bu tarayıcı Web Push bildirimlerini desteklemiyor.
            </div>
        );
    }

    return (
        <div style={{
            background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480,
        }}>
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <I.Alert size={14} style={{ color: 'var(--accent)' }}/>
                <Cap>Tarayıcı Push Bildirimleri</Cap>
            </div>

            {/* Durum */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, width: 64 }}>İzin</span>
                    <Pill
                        color={permission === 'granted' ? A.ok : permission === 'denied' ? A.err : A.warn}
                        bg={permission === 'granted' ? 'rgba(74,222,128,0.10)' : permission === 'denied' ? 'rgba(248,113,113,0.10)' : 'rgba(251,191,36,0.10)'}
                    >
                        {permission === 'granted' ? 'VERİLDİ' : permission === 'denied' ? 'REDDEDİLDİ' : 'BEKLİYOR'}
                    </Pill>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, width: 64 }}>Durum</span>
                    <Pill
                        color={subscribed ? A.ok : A.dim}
                        bg={subscribed ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.04)'}
                    >
                        {loading ? 'YÜKLENİYOR' : subscribed ? 'AKTİF' : 'PASİF'}
                    </Pill>
                </div>
            </div>

            {/* Açıklama */}
            <div style={{ fontSize: 11, color: A.dim, lineHeight: 1.6, fontFamily: A.sans }}>
                Etkinleştirildiğinde sunucu çökmesi ve disk uyarıları bu tarayıcıya anlık bildirim olarak iletilir.
            </div>

            {/* İzin reddedildi uyarısı */}
            {permission === 'denied' && (
                <div style={{
                    fontSize: 11, color: A.warn, fontFamily: A.mono, lineHeight: 1.6,
                    background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 3, padding: '8px 12px',
                }}>
                    Bildirim izni reddedildi. Tarayıcı adres çubuğundaki kilit simgesinden izni manuel olarak vermeniz gerekiyor.
                </div>
            )}

            {/* Hata */}
            {error && (
                <div style={{
                    fontSize: 11, color: A.err, fontFamily: A.mono,
                    background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                    borderRadius: 3, padding: '8px 12px',
                }}>
                    {error}
                </div>
            )}

            {/* Eylem butonu */}
            {permission !== 'denied' && (
                <div>
                    {subscribed ? (
                        <button onClick={unsubscribe} disabled={loading} style={{
                            ...btnGhost, opacity: loading ? 0.5 : 1, fontSize: 11,
                        }}>
                            Devre Dışı Bırak
                        </button>
                    ) : (
                        <button onClick={subscribe} disabled={loading || !vapidKey} style={{
                            ...btnPrimary, opacity: (loading || !vapidKey) ? 0.5 : 1, fontSize: 11,
                        }}>
                            Etkinleştir
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================
// GÖREV YÖNETİCİSİ
// ============================================================
function TaskManagerPanel() {
    const queryClient = useQueryClient();
    const { data: processesData, isLoading } = useQuery({
        queryKey: ['systemProcesses'],
        queryFn: () => api.get('/system/processes').then(r => r.data),
        refetchInterval: 5000,
    });

    const killMutation = useMutation({
        mutationFn: (pid) => api.post('/system/processes/kill', { pid }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['systemProcesses'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'İşlem sonlandırılamadı'),
    });

    const processes = processesData?.processes || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>Aktif İşlemler · 5s güncelleme</Cap>
                <button onClick={() => queryClient.invalidateQueries({ queryKey: ['systemProcesses'] })}
                    style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                    <I.Restart size={11}/> YENİLE
                </button>
            </div>
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                <table style={tblStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>PID</th>
                            <th style={thStyle}>İşlem</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>CPU</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>RAM</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '32px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                                    <Spinner size={12}/>
                                    <span style={{ fontFamily: A.mono, fontSize: 11, color: A.faint }}>Yükleniyor...</span>
                                </div>
                            </td></tr>
                        ) : processes.length === 0 ? (
                            <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '32px' }}>
                                <I.CPU size={24} style={{ color: A.faintest, marginBottom: 6 }}/>
                                <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>
                                    Aktif Java/ağ işlemi yok
                                </div>
                            </td></tr>
                        ) : (
                            processes.map(proc => (
                                <tr key={proc.pid}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ ...tdStyle, fontFamily: A.mono, fontSize: 11, color: A.faint }}>{proc.pid}</td>
                                    <td style={tdStyle}>
                                        <div style={{ fontSize: 12, color: A.text }}>{proc.name}</div>
                                        <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest, marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {proc.command}
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                        <span style={{
                                            fontFamily: A.mono, fontSize: 11,
                                            color: proc.cpu > 50 ? A.err : A.ok,
                                            background: proc.cpu > 50 ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                                            padding: '2px 6px', borderRadius: 2,
                                        }}>
                                            {proc.cpu}%
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: A.mono, fontSize: 11, color: A.dim }}>
                                        {proc.mem} MB
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                        <button onClick={() => {
                                            if (window.confirm(`${proc.name} (PID: ${proc.pid}) sonlandırılsın mı?`)) {
                                                killMutation.mutate(proc.pid);
                                            }
                                        }}
                                            style={{
                                                padding: '3px 10px', borderRadius: 2,
                                                background: 'rgba(248,113,113,0.08)',
                                                border: `1px solid rgba(248,113,113,0.2)`,
                                                color: A.err, cursor: 'pointer',
                                                fontFamily: A.mono, fontSize: 10,
                                                letterSpacing: '0.04em',
                                            }}>
                                            KILL
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================
// PANEL KULLANICILARI
// ============================================================
function PanelUsersPanel() {
    const queryClient = useQueryClient();
    const [modal, setModal] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', category_id: '' });

    const { data: usersData, isLoading } = useQuery({
        queryKey: ['panelUsers'],
        queryFn: () => api.get('/users').then(r => r.data),
    });

    const { data: catsData } = useQuery({
        queryKey: ['permCategories'],
        queryFn: () => api.get('/permission-categories').then(r => r.data),
    });

    const addMutation = useMutation({
        mutationFn: (data) => api.post('/users', data),
        onSuccess: async (_, data) => {
            toast.success('Kullanıcı eklendi');
            const { data: allUsers } = await api.get('/users');
            if (data.category_id) {
                const created = allUsers.users.find(u => u.username === data.username);
                if (created) await api.put(`/users/${created.id}/category`, { category_id: data.category_id });
            }
            setModal(false);
            setNewUser({ username: '', password: '', role: 'user', category_id: '' });
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Eklenemedi'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/users/${id}`),
        onSuccess: () => { toast.success('Kullanıcı silindi'); queryClient.invalidateQueries({ queryKey: ['panelUsers'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Silinemedi'),
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role }) => api.put(`/users/${id}/role`, { role }),
        onSuccess: () => { toast.success('Rol güncellendi'); queryClient.invalidateQueries({ queryKey: ['panelUsers'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncellenemedi'),
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, category_id }) => api.put(`/users/${id}/category`, { category_id: category_id || null }),
        onSuccess: () => { toast.success('Kategori güncellendi'); queryClient.invalidateQueries({ queryKey: ['panelUsers'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncellenemedi'),
    });

    const users = usersData?.users || [];
    const categories = catsData?.categories || [];
    const selStyle = {
        background: A.bg, border: `1px solid ${A.border}`,
        color: A.text, fontFamily: A.mono, fontSize: 10,
        padding: '3px 8px', borderRadius: 2, outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>Panel erişimi olan hesaplar</Cap>
                <button onClick={() => setModal(true)}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 12px' }}>
                    <I.Plus size={11}/> YENİ KULLANICI
                </button>
            </div>
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                <table style={tblStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Kullanıcı Adı</th>
                            <th style={thStyle}>Rol</th>
                            <th style={thStyle}>İzin Kategorisi</th>
                            <th style={thStyle}>Kayıt</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}/>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner/></div>
                            </td></tr>
                        ) : users.map(user => (
                            <tr key={user.id}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: 1,
                                            background: 'var(--accent)', display: 'grid', placeItems: 'center',
                                            color: '#000', fontFamily: A.mono, fontWeight: 700, fontSize: 10, flexShrink: 0,
                                        }}>
                                            {(user.username || '?').slice(0, 1).toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: 12, color: A.text }}>{user.username}</span>
                                    </div>
                                </td>
                                <td style={tdStyle}>
                                    <select value={user.role}
                                        onChange={e => updateRoleMutation.mutate({ id: user.id, role: e.target.value })}
                                        style={{
                                            ...selStyle,
                                            color: user.role === 'admin' ? A.warn : A.dim,
                                        }}>
                                        <option value="user">Misafir</option>
                                        <option value="admin">Yönetici</option>
                                    </select>
                                </td>
                                <td style={tdStyle}>
                                    {user.role === 'admin' ? (
                                        <Pill color={A.warn} bg="rgba(251,191,36,0.1)">TAM ERİŞİM</Pill>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <select value={user.category_id || ''}
                                                onChange={e => updateCategoryMutation.mutate({ id: user.id, category_id: e.target.value ? parseInt(e.target.value) : null })}
                                                style={selStyle}>
                                                <option value="">— Kategori Yok —</option>
                                                {categories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                ))}
                                            </select>
                                            {user.category_color && (
                                                <span style={{ width: 8, height: 8, borderRadius: 99, background: user.category_color, flexShrink: 0 }}/>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                                    {new Date(user.created_at).toLocaleDateString('tr-TR')}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    <button
                                        onClick={() => window.confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?') && deleteMutation.mutate(user.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 4 }}
                                        onMouseEnter={e => e.currentTarget.style.color = A.err}
                                        onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                        <I.Trash size={13}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && (
                <HodoModal onClose={() => setModal(false)} maxWidth={460}>
                    <HodoModalHeader title="Yeni Kullanıcı Ekle" onClose={() => setModal(false)}/>
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>Kullanıcı Adı</Cap>
                            <Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder="kullanici_adi" mono/>
                        </div>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>Şifre</Cap>
                            <Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" mono/>
                        </div>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 6 }}>Rol</Cap>
                            <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                style={{
                                    background: A.bg, border: `1px solid ${A.border}`,
                                    color: A.text, fontFamily: A.mono, fontSize: 11,
                                    padding: '7px 10px', borderRadius: 2, outline: 'none', width: '100%',
                                }}>
                                <option value="user">Misafir (Yalnızca Okuma)</option>
                                <option value="admin">Yönetici (Admin)</option>
                            </select>
                        </div>
                        {newUser.role === 'user' && (
                            <div>
                                <Cap style={{ display: 'block', marginBottom: 6 }}>İzin Kategorisi</Cap>
                                <select value={newUser.category_id} onChange={e => setNewUser({ ...newUser, category_id: e.target.value })}
                                    style={{
                                        background: A.bg, border: `1px solid ${A.border}`,
                                        color: A.text, fontFamily: A.mono, fontSize: 11,
                                        padding: '7px 10px', borderRadius: 2, outline: 'none', width: '100%',
                                    }}>
                                    <option value="">— Kategori Yok (Sıfır Erişim) —</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                                <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest, marginTop: 4 }}>
                                    Kategori seçilmezse kullanıcı hiçbir sayfayı göremez.
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                        <button onClick={() => setModal(false)} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                        <button onClick={() => addMutation.mutate(newUser)} disabled={addMutation.isPending || !newUser.username || !newUser.password}
                            style={{
                                ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                opacity: (!newUser.username || !newUser.password) ? 0.4 : 1,
                            }}>
                            {addMutation.isPending ? <Spinner size={12}/> : null}
                            OLUŞTUR
                        </button>
                    </div>
                </HodoModal>
            )}
        </div>
    );
}

// ============================================================
// İZİN KATEGORİLERİ
// ============================================================
function CategoriesPanel() {
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['permCategories'],
        queryFn: () => api.get('/permission-categories').then(r => r.data),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/permission-categories/${id}`),
        onSuccess: () => {
            toast.success('Kategori silindi');
            queryClient.invalidateQueries({ queryKey: ['permCategories'] });
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Silinemedi'),
    });

    const categories = data?.categories || [];
    const openCreate = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (cat) => { setEditing(cat); setModalOpen(true); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>Hangi sayfaların görüneceğini belirleyen gruplar</Cap>
                <button onClick={openCreate}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 12px' }}>
                    <I.Plus size={11}/> YENİ KATEGORİ
                </button>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}><Spinner/></div>
            ) : categories.length === 0 ? (
                <div style={{
                    background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                    padding: '40px 0', textAlign: 'center',
                }}>
                    <I.Stack size={24} style={{ color: A.faintest, marginBottom: 8 }}/>
                    <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>Henüz kategori yok</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {categories.map(cat => {
                        const pages = Array.isArray(cat.pages) ? cat.pages : (() => { try { return JSON.parse(cat.pages || '[]'); } catch { return []; } })();
                        return (
                            <div key={cat.id} style={{
                                background: A.panel, border: `1px solid ${A.border}`,
                                borderRadius: 4, padding: '12px 14px',
                                display: 'flex', flexDirection: 'column', gap: 10,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 99, background: cat.color || '#a78bfa', flexShrink: 0 }}/>
                                        <span style={{ fontSize: 13, fontWeight: 500, color: A.text }}>{cat.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => openEdit(cat)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 3 }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                                            onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                            <I.Wrench size={12}/>
                                        </button>
                                        <button onClick={() => window.confirm(`"${cat.name}" silinsin mi?`) && deleteMutation.mutate(cat.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 3 }}
                                            onMouseEnter={e => e.currentTarget.style.color = A.err}
                                            onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                            <I.Trash size={12}/>
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {pages.length === 0 ? (
                                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>Hiçbir sayfa seçilmedi</span>
                                    ) : ALL_PAGES.filter(p => pages.includes(p.key)).map(p => (
                                        <span key={p.key} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontFamily: A.mono, fontSize: 10,
                                            padding: '2px 7px', borderRadius: 2,
                                            background: (cat.color || '#a78bfa') + '22',
                                            color: cat.color || '#a78bfa',
                                        }}>
                                            {p.emoji} {p.label}
                                        </span>
                                    ))}
                                </div>
                                <Cap>{cat.user_count ?? 0} kullanıcı</Cap>
                            </div>
                        );
                    })}
                </div>
            )}

            {modalOpen && (
                <CategoryModal
                    initial={editing}
                    onClose={() => setModalOpen(false)}
                    onSaved={() => {
                        setModalOpen(false);
                        queryClient.invalidateQueries({ queryKey: ['permCategories'] });
                        queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
                    }}
                />
            )}
        </div>
    );
}

function CategoryModal({ initial, onClose, onSaved }) {
    const [name, setName] = useState(initial?.name || '');
    const [color, setColor] = useState(initial?.color || PRESET_COLORS[0]);
    const [pages, setPages] = useState(() => {
        const p = initial?.pages;
        if (Array.isArray(p)) return p;
        try { return JSON.parse(p || '[]'); } catch { return []; }
    });
    const [saving, setSaving] = useState(false);

    const togglePage = (key) => setPages(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    const handleSave = async () => {
        if (!name.trim()) { toast.error('Kategori adı boş olamaz'); return; }
        setSaving(true);
        try {
            if (initial?.id) {
                await api.put(`/permission-categories/${initial.id}`, { name: name.trim(), color, pages });
                toast.success('Kategori güncellendi');
            } else {
                await api.post('/permission-categories', { name: name.trim(), color, pages });
                toast.success('Kategori oluşturuldu');
            }
            onSaved();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    return (
        <HodoModal onClose={onClose} maxWidth={520}>
            <HodoModalHeader title={initial ? 'Kategoriyi Düzenle' : 'Yeni Kategori Oluştur'} onClose={onClose}/>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                    <Cap style={{ display: 'block', marginBottom: 6 }}>Kategori Adı</Cap>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="örn. Builder, Moderatör..." autoFocus/>
                </div>
                <div>
                    <Cap style={{ display: 'block', marginBottom: 8 }}>Renk</Cap>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {PRESET_COLORS.map(c => (
                            <button key={c} onClick={() => setColor(c)}
                                style={{
                                    width: 22, height: 22, borderRadius: 99,
                                    background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                                    cursor: 'pointer', outline: 'none',
                                }}/>
                        ))}
                        <input type="color" value={color} onChange={e => setColor(e.target.value)}
                            style={{ width: 22, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}
                        />
                    </div>
                </div>
                <div>
                    <Cap style={{ display: 'block', marginBottom: 8 }}>
                        Erişilebilir Sayfalar ({pages.length}/{ALL_PAGES.length})
                    </Cap>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {ALL_PAGES.map(page => {
                            const sel = pages.includes(page.key);
                            return (
                                <button key={page.key} onClick={() => togglePage(page.key)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '6px 8px', borderRadius: 2, cursor: 'pointer',
                                        border: `1px solid ${sel ? color + '66' : A.border}`,
                                        background: sel ? color + '22' : 'transparent',
                                        color: sel ? color : A.faint, fontSize: 11,
                                        fontFamily: A.sans, textAlign: 'left',
                                    }}>
                                    {sel ? <I.Check size={10} style={{ flexShrink: 0 }}/> : <span style={{ fontSize: 12 }}>{page.emoji}</span>}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${A.border}` }}>
                <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                <button onClick={handleSave} disabled={saving}
                    style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {saving ? <Spinner size={12}/> : null}
                    {initial ? 'GÜNCELLE' : 'OLUŞTUR'}
                </button>
            </div>
        </HodoModal>
    );
}

// ============================================================
// API TOKEN YÖNETİMİ
// ============================================================
function ApiTokensPanel() {
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', expiresInDays: '' });
    const [revealed, setRevealed] = useState(null);

    const { data: tokens = [], isLoading } = useQuery({
        queryKey: ['api-tokens'],
        queryFn: () => api.get('/tokens').then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (body) => api.post('/tokens', body).then(r => r.data),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['api-tokens'] });
            setShowCreate(false);
            setForm({ name: '', expiresInDays: '' });
            setRevealed({ id: data.id, token: data.token });
            toast.success('Token oluşturuldu — şimdi kopyalayın!');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const revokeMutation = useMutation({
        mutationFn: (id) => api.delete(`/tokens/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-tokens'] }); toast.success('Token iptal edildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const fmtDate = (ts) => !ts ? '—' : new Date(ts * 1000).toLocaleDateString('tr-TR');
    const fmtAgo = (str) => {
        if (!str) return '—';
        const d = Math.floor((Date.now() - new Date(str).getTime()) / 86400000);
        return d === 0 ? 'bugün' : `${d} gün önce`;
    };

    const copyToken = (token) => navigator.clipboard.writeText(token).then(() => toast.success('Kopyalandı!'));

    const inputSt = {
        background: A.bg, border: `1px solid ${A.border}`,
        color: A.text, fontFamily: A.mono, fontSize: 11,
        padding: '6px 10px', borderRadius: 2, outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>Harici araçlar için API erişim tokenları</Cap>
                <button onClick={() => setShowCreate(v => !v)}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 12px' }}>
                    <I.Plus size={11}/> YENİ TOKEN
                </button>
            </div>

            {showCreate && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Cap>Yeni API Token</Cap>
                        <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                            <I.X size={14}/>
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 4 }}>İsim</Cap>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="örn: Monitoring Script" style={{ ...inputSt, width: '100%' }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                                onBlur={e => e.target.style.borderColor = A.border}
                            />
                        </div>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 4 }}>Süre (gün, boş = sonsuz)</Cap>
                            <input type="number" value={form.expiresInDays} onChange={e => setForm(f => ({ ...f, expiresInDays: e.target.value }))}
                                placeholder="30" style={{ ...inputSt, width: '100%' }}
                            />
                        </div>
                    </div>
                    <button onClick={() => createMutation.mutate({ name: form.name, expiresInDays: form.expiresInDays ? parseInt(form.expiresInDays) : undefined })}
                        disabled={!form.name.trim() || createMutation.isPending}
                        style={{
                            ...btnPrimary, width: '100%', justifyContent: 'center',
                            display: 'flex', alignItems: 'center', gap: 6,
                            opacity: !form.name.trim() ? 0.4 : 1,
                        }}>
                        {createMutation.isPending ? <Spinner size={12}/> : null}
                        OLUŞTUR
                    </button>
                </div>
            )}

            {revealed && (
                <div style={{
                    background: 'rgba(251,191,36,0.06)', border: `1px solid rgba(251,191,36,0.2)`,
                    borderRadius: 4, padding: '12px 14px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <I.Alert size={12} style={{ color: A.warn }}/>
                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.warn }}>
                            Bu tokeni şimdi kopyalayın — bir daha gösterilmeyecek!
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <code style={{
                            flex: 1, fontFamily: A.mono, fontSize: 10, color: A.text,
                            background: A.bg, border: `1px solid ${A.border}`,
                            padding: '6px 10px', borderRadius: 2, wordBreak: 'break-all',
                        }}>
                            {revealed.token}
                        </code>
                        <button onClick={() => copyToken(revealed.token)}
                            style={{ ...btnGhost, padding: '6px 10px', flexShrink: 0 }}>
                            <I.Clipboard size={13}/>
                        </button>
                        <button onClick={() => setRevealed(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}>
                            <I.X size={14}/>
                        </button>
                    </div>
                </div>
            )}

            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', borderBottom: `1px solid ${A.border}`, display: 'flex', justifyContent: 'space-between' }}>
                    <Cap>Tokenlar</Cap>
                    <Cap>{(Array.isArray(tokens) ? tokens : []).filter(t => t.is_active).length} aktif</Cap>
                </div>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Spinner/></div>
                ) : !Array.isArray(tokens) || tokens.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <I.Signal size={24} style={{ color: A.faintest, marginBottom: 6 }}/>
                        <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>Henüz token yok</div>
                    </div>
                ) : (
                    (Array.isArray(tokens) ? tokens : []).map(t => (
                        <div key={t.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', borderBottom: `1px solid ${A.border}`,
                            opacity: t.is_active ? 1 : 0.5,
                        }}>
                            <I.Signal size={14} style={{ color: t.is_active ? 'var(--accent)' : A.faint, flexShrink: 0 }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 12, color: A.text }}>{t.name}</span>
                                    {!t.is_active && <Pill>İPTAL</Pill>}
                                    {t.expires_at && t.expires_at < Date.now() / 1000 && (
                                        <Pill color={A.err} bg="rgba(248,113,113,0.1)">SÜRESI DOLDU</Pill>
                                    )}
                                </div>
                                <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest, marginTop: 2 }}>
                                    {t.token_prefix}... · {t.created_by} · {fmtAgo(t.created_at)}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>Son Kullanım</div>
                                <div style={{ fontFamily: A.mono, fontSize: 11, color: A.dim }}>
                                    {t.last_used_at ? fmtDate(t.last_used_at) : '—'}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>Bitiş</div>
                                <div style={{ fontFamily: A.mono, fontSize: 11, color: A.dim }}>{fmtDate(t.expires_at)}</div>
                            </div>
                            {t.is_active && (
                                <button onClick={() => { if (window.confirm(`"${t.name}" iptal edilsin mi?`)) revokeMutation.mutate(t.id); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 4 }}
                                    onMouseEnter={e => e.currentTarget.style.color = A.err}
                                    onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                    <I.Trash size={13}/>
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Clipboard icon (basit inline) ─────────────────────────────────────────
I.Clipboard = ({ size = 16, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <rect x="9" y="2" width="6" height="4" rx="1"/>
        <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
    </svg>
);

// ============================================================
// SUNUCU ŞABLONLARI
// ============================================================
function TemplatesPanel() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', description: '' });

    const { data, isLoading } = useQuery({
        queryKey: ['server-templates'],
        queryFn: () => api.get('/templates').then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (body) => api.post('/templates', body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['server-templates'] }); setShowForm(false); setForm({ name: '', description: '' }); toast.success('Şablon kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const applyMutation = useMutation({
        mutationFn: (id) => api.put(`/templates/${id}/apply`),
        onSuccess: () => toast.success('Şablon uygulandı — sunucuyu yeniden başlatın'),
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/templates/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['server-templates'] }); toast.success('Şablon silindi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const templates = data?.templates || [];
    const inputSt = {
        background: A.bg, border: `1px solid ${A.border}`,
        color: A.text, fontFamily: A.mono, fontSize: 11,
        padding: '6px 10px', borderRadius: 2, outline: 'none', width: '100%',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Cap>Aktif profilin RAM/JVM/port ayarlarını şablon olarak kaydet</Cap>
                <button onClick={() => setShowForm(v => !v)}
                    style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 12px' }}>
                    <I.Plus size={11}/> ŞABLON KAYDET
                </button>
            </div>

            {showForm && (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 4 }}>Şablon Adı</Cap>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="örn: Vanilla 4GB" style={inputSt} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = A.border}/>
                        </div>
                        <div>
                            <Cap style={{ display: 'block', marginBottom: 4 }}>Açıklama</Cap>
                            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama..." style={inputSt} onFocus={e => e.target.style.borderColor = 'var(--accent)'} onBlur={e => e.target.style.borderColor = A.border}/>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowForm(false)} style={{ ...btnGhost, flex: 1 }}>İPTAL</button>
                        <button onClick={() => createMutation.mutate(form)} disabled={!form.name.trim() || createMutation.isPending}
                            style={{ ...btnPrimary, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {createMutation.isPending ? <Spinner size={12}/> : null}
                            AKTİF PROFİLİ KAYDET
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}><Spinner/></div>
            ) : templates.length === 0 ? (
                <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '40px 0', textAlign: 'center' }}>
                    <I.Archive size={24} style={{ color: A.faintest, marginBottom: 8 }}/>
                    <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>Henüz şablon yok</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {templates.map(t => (
                        <div key={t.id} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '12px 14px',
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <I.Archive size={14} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: A.text }}>{t.name}</div>
                                {t.description && <div style={{ fontSize: 11, color: A.faint, marginTop: 2 }}>{t.description}</div>}
                                <div style={{ display: 'flex', gap: 10, marginTop: 4, fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                                    {t.config?.min_ram && <span>Min: {t.config.min_ram}</span>}
                                    {t.config?.max_ram && <span>Max: {t.config.max_ram}</span>}
                                    {t.config?.server_port && <span>Port: {t.config.server_port}</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button onClick={() => { if (window.confirm(`"${t.name}" şablonunu uygula?`)) applyMutation.mutate(t.id); }}
                                    style={{
                                        ...btnGhost, fontSize: 10, padding: '4px 10px',
                                        color: 'var(--accent)', borderColor: 'rgba(167,139,250,0.2)',
                                    }}>
                                    UYGULA
                                </button>
                                <button onClick={() => { if (window.confirm('Şablonu sil?')) deleteMutation.mutate(t.id); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint, padding: 4 }}
                                    onMouseEnter={e => e.currentTarget.style.color = A.err}
                                    onMouseLeave={e => e.currentTarget.style.color = A.faint}>
                                    <I.Trash size={13}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// KAYNAK UYARI EŞİKLERİ
// ============================================================
function AlertsPanel() {
    const [cpu, setCpu] = useState('');
    const [ram, setRam] = useState('');
    const [saved, setSaved] = useState(false);

    useQuery({
        queryKey: ['app-settings-alerts'],
        queryFn: () => api.get('/system/alert-thresholds').then(r => r.data),
        onSuccess: (d) => {
            if (d?.cpu != null) setCpu(String(d.cpu));
            if (d?.ram != null) setRam(String(d.ram));
        },
    });

    const saveMutation = useMutation({
        mutationFn: () => api.put('/system/alert-thresholds', {
            cpu: cpu ? parseFloat(cpu) : null,
            ram: ram ? parseFloat(ram) : null,
        }),
        onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); toast.success('Eşikler kaydedildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Kaydedilemedi'),
    });

    const inputSt = {
        background: A.bg, border: `1px solid ${A.border}`,
        color: A.text, fontFamily: A.mono, fontSize: 12,
        padding: '7px 10px', borderRadius: 2, outline: 'none', width: '100%',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
            <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faint, lineHeight: 1.6 }}>
                Belirtilen eşikleri aşan CPU/RAM kullanımı Discord webhook üzerinden bildirim gönderir.
                Aynı uyarı 5 dakikada bir tekrar tetiklenir.
            </div>
            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                    <Cap style={{ display: 'block', marginBottom: 6 }}>CPU Eşiği (%)</Cap>
                    <input type="number" min="1" max="100" value={cpu} onChange={e => setCpu(e.target.value)}
                        placeholder="örn: 90 (boş = kapalı)" style={inputSt}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = A.border}
                    />
                </div>
                <div>
                    <Cap style={{ display: 'block', marginBottom: 6 }}>RAM Eşiği (%)</Cap>
                    <input type="number" min="1" max="100" value={ram} onChange={e => setRam(e.target.value)}
                        placeholder="örn: 85 (boş = kapalı)" style={inputSt}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = A.border}
                    />
                </div>
                <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest }}>
                    Discord webhookunu Discord sayfasından yapılandırın.
                </div>
                <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    style={{ ...btnPrimary, width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saved
                        ? <><I.Check size={12}/> KAYDEDİLDİ</>
                        : saveMutation.isPending ? <><Spinner size={12}/> KAYDEDİLİYOR...</>
                        : 'KAYDET'
                    }
                </button>
            </div>
        </div>
    );
}

// ============================================================
// AUDİT LOG
// ============================================================
function AuditLogPanel() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['audit-log', search],
        queryFn: () => api.get(`/audit?limit=200${search ? `&user=${encodeURIComponent(search)}` : ''}`).then(r => r.data),
        refetchInterval: 15000,
    });

    const userSummary = (() => {
        const logs = data?.logs || [];
        const map = new Map();
        for (const log of logs) {
            if (!map.has(log.user)) map.set(log.user, { user: log.user, count: 0, lastAction: log.action, lastAt: log.created_at });
            const entry = map.get(log.user);
            entry.count++;
            if (new Date(log.created_at) > new Date(entry.lastAt)) {
                entry.lastAction = log.action;
                entry.lastAt = log.created_at;
            }
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    })();

    const clearMutation = useMutation({
        mutationFn: () => api.delete('/audit'),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-log'] }); toast.success('Log temizlendi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const actionColor = (action) => {
        if (/baslat/.test(action)) return A.ok;
        if (/durdur|kapat/.test(action)) return A.faint;
        if (/ban/.test(action)) return A.err;
        if (/ban_kaldir/.test(action)) return '#60a5fa';
        if (/yeniden/.test(action)) return A.warn;
        return 'var(--accent)';
    };

    const logs = data?.logs || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Kullanıcı aktivite özeti */}
            {userSummary.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                    {userSummary.map(u => (
                        <div key={u.user} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '10px 12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {u.user}
                                </span>
                                <Pill color="var(--accent)" bg="rgba(167,139,250,0.1)">{u.count}</Pill>
                            </div>
                            <div style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {u.lastAction.replace(/_/g, ' ')}
                            </div>
                            <div style={{ fontFamily: A.mono, fontSize: 9, color: A.faintest, marginTop: 3 }}>
                                {new Date(u.lastAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', flex: '0 0 200px' }}>
                    <I.Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: A.faint }}/>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Kullanıcıya göre filtrele"
                        style={{
                            background: A.bg, border: `1px solid ${A.border}`,
                            color: A.text, fontFamily: A.mono, fontSize: 11,
                            padding: '5px 8px 5px 26px', borderRadius: 2, outline: 'none', width: '100%',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = A.border}
                    />
                </div>
                <Cap>{logs.length} kayıt</Cap>
                <button onClick={() => { if (window.confirm('Tüm audit logları silinsin mi?')) clearMutation.mutate(); }}
                    style={{
                        ...btnGhost, display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 10, color: A.err, borderColor: 'rgba(248,113,113,0.2)',
                    }}>
                    <I.Trash size={11}/> TEMİZLE
                </button>
            </div>

            <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, overflow: 'hidden' }}>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Spinner/></div>
                ) : logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <I.Folder size={24} style={{ color: A.faintest, marginBottom: 6 }}/>
                        <div style={{ fontFamily: A.mono, fontSize: 11, color: A.faintest }}>Henüz kayıt yok</div>
                    </div>
                ) : (
                    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                        {logs.map(log => (
                            <div key={log.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 14px', borderBottom: `1px solid ${A.border}`,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <span style={{
                                    fontFamily: A.mono, fontSize: 10, color: actionColor(log.action),
                                    background: actionColor(log.action) + '22',
                                    padding: '2px 7px', borderRadius: 2, flexShrink: 0,
                                }}>
                                    {log.action.replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize: 12, color: A.text, flexShrink: 0 }}>{log.user}</span>
                                {log.details && (
                                    <span style={{ fontSize: 11, color: A.faint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.details}
                                    </span>
                                )}
                                <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faintest, flexShrink: 0 }}>
                                    {new Date(log.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
