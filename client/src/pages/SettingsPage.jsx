import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineArrowPath,
    HiOutlineCpuChip,
    HiOutlineShieldCheck,
    HiOutlineUserPlus, HiOutlineTrash, HiOutlinePlus, HiOutlinePencil,
    HiOutlineCheck, HiOutlineTag, HiOutlineKey, HiOutlineClipboard,
    HiOutlineEyeSlash, HiOutlineXMark, HiOutlineClipboardDocumentList,
    HiOutlineBookmarkSquare, HiOutlineBell,
} from 'react-icons/hi2';

// ── Tüm izin verilebilir sayfalar ─────────────────────────────────────────────
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

const PRESET_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('tasks');
    const { t } = useI18n();

    const tabs = [
        { id: 'tasks',     label: 'Görev Yöneticisi',   icon: HiOutlineCpuChip },
        { id: 'users',     label: 'Panel Kullanıcıları', icon: HiOutlineShieldCheck },
        { id: 'categories',label: 'İzin Kategorileri',   icon: HiOutlineTag },
        { id: 'tokens',    label: 'API Tokenları',       icon: HiOutlineKey },
        { id: 'templates', label: 'Şablonlar',           icon: HiOutlineBookmarkSquare },
        { id: 'alerts',    label: 'Kaynak Uyarıları',    icon: HiOutlineBell },
        { id: 'audit',     label: 'Audit Log',           icon: HiOutlineClipboardDocumentList },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between fade-in">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('settings.title')}</h1>
                    <p className="text-gray-500">{t('settings.subtitle')}</p>
                </div>
            </div>

            {/* Tab buttons */}
            <div className="flex gap-2 fade-in overflow-x-auto pb-2 scrollbar-hide">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}>
                        <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'tasks'      && <TaskManagerPanel />}
            {activeTab === 'users'      && <PanelUsersPanel />}
            {activeTab === 'categories' && <CategoriesPanel />}
            {activeTab === 'tokens'     && <ApiTokensPanel />}
            {activeTab === 'templates'  && <TemplatesPanel />}
            {activeTab === 'alerts'     && <AlertsPanel />}
            {activeTab === 'audit'      && <AuditLogPanel />}
        </div>
    );
}


// ============================================================
// PANEL KULLANICI YÖNETİMİ (PanelUsers)
// ============================================================
function PanelUsersPanel() {
    const queryClient = useQueryClient();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
            toast.success('Kullanıcı başarıyla eklendi');
            const { data: allUsers } = await api.get('/users');
            if (data.category_id) {
                const created = allUsers.users.find(u => u.username === data.username);
                if (created) await api.put(`/users/${created.id}/category`, { category_id: data.category_id });
            }
            setIsAddModalOpen(false);
            setNewUser({ username: '', password: '', role: 'user', category_id: '' });
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Kullanıcı eklenemedi'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/users/${id}`),
        onSuccess: () => {
            toast.success('Kullanıcı silindi');
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Silinemedi'),
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role }) => api.put(`/users/${id}/role`, { role }),
        onSuccess: () => {
            toast.success('Rol güncellendi');
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncellenemedi'),
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, category_id }) => api.put(`/users/${id}/category`, { category_id: category_id || null }),
        onSuccess: () => {
            toast.success('Kategori güncellendi');
            queryClient.invalidateQueries({ queryKey: ['panelUsers'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Güncellenemedi'),
    });

    const users = usersData?.users || [];
    const categories = catsData?.categories || [];

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <HiOutlineShieldCheck className="w-5 h-5 text-gray-600" /> Panel Kullanıcıları
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Panel erişimi olan hesapları yönetin.</p>
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="btn-primary text-sm flex items-center gap-2">
                    <HiOutlineUserPlus className="w-4 h-4" /> Yeni Kullanıcı
                </button>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3">Kullanıcı Adı</th>
                                <th className="px-6 py-3">Rol</th>
                                <th className="px-6 py-3">İzin Kategorisi</th>
                                <th className="px-6 py-3">Kayıt Tarihi</th>
                                <th className="px-6 py-3 text-right">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">Yükleniyor...</td>
                                </tr>
                            ) : users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50/50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{user.username}</td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={user.role}
                                            onChange={(e) => updateRoleMutation.mutate({ id: user.id, role: e.target.value })}
                                            className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 ring-1 ring-inset focus:ring-2 focus:ring-primary ${user.role === 'admin' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-blue-50 text-blue-700 ring-blue-600/20'
                                                }`}
                                        >
                                            <option value="user">Misafir (Yalnızca Oku)</option>
                                            <option value="admin">Yönetici (Full Erişim)</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.role === 'admin' ? (
                                            <span className="text-xs text-amber-500 font-medium">Tam Erişim</span>
                                        ) : (
                                            <select
                                                value={user.category_id || ''}
                                                onChange={(e) => updateCategoryMutation.mutate({ id: user.id, category_id: e.target.value ? parseInt(e.target.value) : null })}
                                                className="text-xs px-2 py-1 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:outline-none bg-white text-gray-700 max-w-[160px]"
                                            >
                                                <option value="">— Kategori Yok —</option>
                                                {categories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                ))}
                                            </select>
                                        )}
                                        {user.category_name && user.role !== 'admin' && (
                                            <span
                                                className="ml-2 inline-block w-2 h-2 rounded-full"
                                                style={{ backgroundColor: user.category_color || '#6366f1' }}
                                            />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => window.confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?') && deleteMutation.mutate(user.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <HiOutlineTrash className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Yeni Kullanıcı Modalı */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-in">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Yeni Kullanıcı Ekle</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kullanıcı Adı</label>
                                <input type="text" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="input-field" placeholder="Kullanıcı adı girin..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Şifre</label>
                                <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="input-field" placeholder="Parola belirleyin..." minLength={5} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yetki Rolü</label>
                                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="input-field">
                                    <option value="user">Misafir (Yalnızca Okuma)</option>
                                    <option value="admin">Yönetici (Admin)</option>
                                </select>
                            </div>
                            {newUser.role === 'user' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İzin Kategorisi</label>
                                    <select value={newUser.category_id} onChange={e => setNewUser({ ...newUser, category_id: e.target.value })} className="input-field">
                                        <option value="">— Kategori Yok (Sıfır Erişim) —</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">Kategori seçilmezse kullanıcı hiçbir sayfayı göremez.</p>
                                </div>
                            )}
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setIsAddModalOpen(false)} className="btn-secondary flex-1">İptal</button>
                                <button onClick={() => addMutation.mutate(newUser)} disabled={addMutation.isPending} className="btn-primary flex-1">
                                    {addMutation.isPending ? 'Ekleniyor...' : 'Kullanıcıyı Oluştur'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// ============================================================
// GÖREV YÖNETİCİSİ (TaskManager)
// ============================================================
function TaskManagerPanel() {
    const queryClient = useQueryClient();
    const { data: processesData, isLoading } = useQuery({
        queryKey: ['systemProcesses'],
        queryFn: () => api.get('/system/processes').then(r => r.data),
        refetchInterval: 5000, // 5 saniyede bir otomatik yenile
    });

    const killMutation = useMutation({
        mutationFn: (pid) => api.post('/system/processes/kill', { pid }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['systemProcesses'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'İşlem sonlandırılamadı'),
    });

    const handleKill = (pid, name) => {
        if (window.confirm(`${name} (PID: ${pid}) sürecini sonlandırmak istediğinize emin misiniz? Sunucu anında kapanacaktır.`)) {
            killMutation.mutate(pid);
        }
    };

    const processes = processesData?.processes || [];

    return (
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <HiOutlineCpuChip className="w-5 h-5 text-gray-600" /> Aktif İşlemler
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Sistemdeki Java ve ilgili ağ servisleri. Veriler 5 saniyede bir yenilenir.</p>
                </div>
                <button onClick={() => queryClient.invalidateQueries({ queryKey: ['systemProcesses'] })}
                    className="btn-secondary text-xs py-1.5">
                    <HiOutlineArrowPath className="w-4 h-4" /> Yenile
                </button>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3">PID</th>
                                <th className="px-6 py-3">İşlem Adı</th>
                                <th className="px-6 py-3 text-right">CPU</th>
                                <th className="px-6 py-3 text-right">RAM (MB)</th>
                                <th className="px-6 py-3 text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                                        <div className="flex justify-center mb-3">
                                            <div className="w-6 h-6 border-2 border-gray-200 border-t-amber-500 rounded-full animate-spin" />
                                        </div>
                                        İşlemler yükleniyor...
                                    </td>
                                </tr>
                            ) : processes.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                                        <HiOutlineCpuChip className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>Çalışan aktif Java veya ağ işlemi bulunamadı.</p>
                                    </td>
                                </tr>
                            ) : (
                                processes.map((proc) => (
                                    <tr key={proc.pid} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs">{proc.pid}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{proc.name}</div>
                                            <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate" title={proc.command}>
                                                {proc.command}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-2 py-1 flex-inline justify-center min-w-[3rem] rounded font-medium text-xs ${proc.cpu > 50 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                %{proc.cpu}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium">
                                            {proc.mem} MB
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleKill(proc.pid, proc.name)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-500 border border-red-200 hover:border-red-500 rounded transition-all focus:ring-2 focus:ring-red-500/20 outline-none"
                                            >
                                                Kapat (Kill)
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// İZİN KATEGORİLERİ PANELİ (CategoriesPanel)
// ============================================================
function CategoriesPanel() {
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null); // null = yeni oluştur

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
        <div className="space-y-4 fade-in">
            <div className="glass-card p-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <HiOutlineTag className="w-5 h-5 text-gray-600" /> İzin Kategorileri
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Hangi sayfaların görüneceğini belirleyen gruplar oluşturun.</p>
                </div>
                <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-2">
                    <HiOutlinePlus className="w-4 h-4" /> Yeni Kategori
                </button>
            </div>

            {isLoading ? (
                <div className="glass-card p-8 text-center text-gray-400">Yükleniyor...</div>
            ) : categories.length === 0 ? (
                <div className="glass-card p-12 text-center text-gray-400">
                    <HiOutlineTag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium mb-1">Henüz kategori yok</p>
                    <p className="text-sm">Yeni Kategori butonuna tıklayarak başlayın.</p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map(cat => {
                        const pages = Array.isArray(cat.pages) ? cat.pages : (() => { try { return JSON.parse(cat.pages || '[]'); } catch { return []; } })();
                        return (
                            <div key={cat.id} className="glass-card p-4 space-y-3 group">
                                {/* Başlık */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: cat.color || '#6366f1' }}
                                        />
                                        <span className="font-semibold text-gray-900 truncate">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openEdit(cat)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Düzenle"
                                        >
                                            <HiOutlinePencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => window.confirm(`"${cat.name}" kategorisini silmek istediğinizden emin misiniz?`) && deleteMutation.mutate(cat.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Sil"
                                        >
                                            <HiOutlineTrash className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* İzinli sayfalar */}
                                <div className="flex flex-wrap gap-1.5">
                                    {pages.length === 0 ? (
                                        <span className="text-xs text-gray-400 italic">Hiçbir sayfa seçilmedi</span>
                                    ) : ALL_PAGES.filter(p => pages.includes(p.key)).map(p => (
                                        <span
                                            key={p.key}
                                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                                            style={{ backgroundColor: (cat.color || '#6366f1') + '22', color: cat.color || '#6366f1' }}
                                        >
                                            <span>{p.emoji}</span> {p.label}
                                        </span>
                                    ))}
                                </div>

                                {/* Kullanıcı sayısı */}
                                <p className="text-xs text-gray-400">
                                    {cat.user_count ?? 0} kullanıcı bu kategoride
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Oluştur / Düzenle Modalı */}
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

// ── Kategori oluştur/düzenle modalı ─────────────────────────────────────────
function CategoryModal({ initial, onClose, onSaved }) {
    const [name, setName] = useState(initial?.name || '');
    const [color, setColor] = useState(initial?.color || PRESET_COLORS[0]);
    const [pages, setPages] = useState(() => {
        const p = initial?.pages;
        if (Array.isArray(p)) return p;
        try { return JSON.parse(p || '[]'); } catch { return []; }
    });
    const [saving, setSaving] = useState(false);

    const togglePage = (key) => {
        setPages(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl scale-in">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-5">
                    {initial ? 'Kategoriyi Düzenle' : 'Yeni Kategori Oluştur'}
                </h3>

                <div className="space-y-5">
                    {/* İsim */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori Adı</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="input-field"
                            placeholder="örn. Builder, Moderatör..."
                            autoFocus
                        />
                    </div>

                    {/* Renk */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Renk</label>
                        <div className="flex items-center gap-2 flex-wrap">
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                    style={{
                                        backgroundColor: c,
                                        boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : undefined,
                                    }}
                                />
                            ))}
                            <input
                                type="color"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                className="w-7 h-7 rounded-full border border-gray-200 cursor-pointer"
                                title="Özel renk seç"
                            />
                        </div>
                    </div>

                    {/* Sayfa İzinleri */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Erişilebilir Sayfalar
                            <span className="ml-2 text-xs font-normal text-gray-400">({pages.length}/{ALL_PAGES.length} seçili)</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {ALL_PAGES.map(page => {
                                const selected = pages.includes(page.key);
                                return (
                                    <button
                                        key={page.key}
                                        onClick={() => togglePage(page.key)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                                            selected
                                                ? 'border-transparent text-white'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 bg-white'
                                        }`}
                                        style={selected ? { backgroundColor: color, borderColor: color } : {}}
                                    >
                                        {selected
                                            ? <HiOutlineCheck className="w-4 h-4 flex-shrink-0" />
                                            : <span className="w-4 h-4 flex-shrink-0 text-base leading-none">{page.emoji}</span>
                                        }
                                        <span className="truncate">{page.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="btn-secondary flex-1">İptal</button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                        {saving ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Kaydediliyor...</>
                        ) : (
                            <><HiOutlineCheck className="w-4 h-4" /> {initial ? 'Güncelle' : 'Oluştur'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// API TOKEN YÖNETİMİ
// ============================================================
function ApiTokensPanel() {
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', expiresInDays: '' });
    const [revealed, setRevealed] = useState(null); // { id, token }

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
            toast.success('Token oluşturuldu — lütfen şimdi kopyalayın!');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const revokeMutation = useMutation({
        mutationFn: (id) => api.delete(`/tokens/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-tokens'] }); toast.success('Token iptal edildi'); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    function fmtDate(ts) {
        if (!ts) return '—';
        return new Date(ts * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function fmtAgo(str) {
        if (!str) return '—';
        const d = Math.floor((Date.now() - new Date(str).getTime()) / 86400000);
        return d === 0 ? 'bugün' : `${d} gün önce`;
    }

    const copyToken = (token) => {
        navigator.clipboard.writeText(token).then(() => toast.success('Kopyalandı!'));
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Harici araçlar ve scriptler için API erişim tokenları. Token yalnızca oluşturulduğunda gösterilir.</p>
                </div>
                <button onClick={() => setShowCreate(v => !v)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 flex-shrink-0 ml-4">
                    <HiOutlinePlus className="w-4 h-4" /> Yeni Token
                </button>
            </div>

            {/* Yeni token formu */}
            {showCreate && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Yeni API Token</h3>
                        <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                            <HiOutlineXMark className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">İsim</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="örn: Monitoring Script"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Süre (gün, boş = sonsuz)</label>
                            <input type="number" value={form.expiresInDays} onChange={e => setForm(f => ({ ...f, expiresInDays: e.target.value }))}
                                placeholder="örn: 30"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <button onClick={() => createMutation.mutate({ name: form.name, expiresInDays: form.expiresInDays ? parseInt(form.expiresInDays) : undefined })}
                        disabled={!form.name.trim() || createMutation.isPending}
                        className="w-full py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-40">
                        {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
                    </button>
                </div>
            )}

            {/* Token gösterme kutusu — sadece bir kez */}
            {revealed && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <HiOutlineEyeSlash className="w-4 h-4 flex-shrink-0" />
                        <span className="text-xs font-semibold">Bu tokeni şimdi kopyalayın — bir daha gösterilmeyecek!</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white break-all">
                            {revealed.token}
                        </code>
                        <button onClick={() => copyToken(revealed.token)}
                            className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800 flex-shrink-0">
                            <HiOutlineClipboard className="w-4 h-4" />
                        </button>
                        <button onClick={() => setRevealed(null)}
                            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0">
                            <HiOutlineXMark className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Token listesi */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tokenlar</span>
                    <span className="text-xs text-gray-400">{tokens.filter(t => t.is_active).length} aktif</span>
                </div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="py-10 text-center">
                        <HiOutlineKey className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm text-gray-400">Henüz token yok.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                        {tokens.map(t => (
                            <div key={t.id} className={`flex items-center gap-3 px-5 py-3 ${!t.is_active ? 'opacity-50' : ''}`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.is_active ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                    <HiOutlineKey className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm text-gray-900 dark:text-white">{t.name}</span>
                                        {!t.is_active && <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">iptal edildi</span>}
                                        {t.expires_at && t.expires_at < Date.now() / 1000 && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-500 px-1.5 py-0.5 rounded-full">süresi doldu</span>}
                                    </div>
                                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                                        {t.token_prefix}... · oluşturan: {t.created_by} · {fmtAgo(t.created_at)}
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 mr-2">
                                    <div className="text-xs text-gray-400">Son kullanım</div>
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{t.last_used_at ? fmtDate(t.last_used_at) : '—'}</div>
                                </div>
                                <div className="text-right flex-shrink-0 mr-2">
                                    <div className="text-xs text-gray-400">Bitiş</div>
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{fmtDate(t.expires_at)}</div>
                                </div>
                                {t.is_active && (
                                    <button onClick={() => { if (window.confirm(`"${t.name}" tokeni iptal edilsin mi?`)) revokeMutation.mutate(t.id); }}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

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

    return (
        <div className="space-y-4 fade-in">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Aktif profilin RAM/JVM/port ayarlarını şablon olarak kaydedin, sonra tek tıkla uygulayın.</p>
                <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:opacity-90 flex-shrink-0 ml-4">
                    <HiOutlinePlus className="w-4 h-4" /> Şablon Kaydet
                </button>
            </div>

            {showForm && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Şablon Adı</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="örn: Vanilla 4GB" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Açıklama (isteğe bağlı)</label>
                            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama..." className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(false)} className="btn-secondary text-sm flex-1">İptal</button>
                        <button onClick={() => createMutation.mutate(form)} disabled={!form.name.trim() || createMutation.isPending} className="btn-primary text-sm flex-1">
                            {createMutation.isPending ? 'Kaydediliyor...' : 'Aktif Profili Kaydet'}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-8 text-gray-400">Yükleniyor...</div>
            ) : templates.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <HiOutlineBookmarkSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>Henüz şablon yok.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {templates.map(t => (
                        <div key={t.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                <HiOutlineBookmarkSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-gray-900 dark:text-white">{t.name}</p>
                                {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                                <div className="flex gap-3 mt-1 text-xs text-gray-400 font-mono">
                                    {t.config.min_ram && <span>Min: {t.config.min_ram}</span>}
                                    {t.config.max_ram && <span>Max: {t.config.max_ram}</span>}
                                    {t.config.server_port && <span>Port: {t.config.server_port}</span>}
                                </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button onClick={() => { if (window.confirm(`"${t.name}" şablonunu uygula?`)) applyMutation.mutate(t.id); }}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60">
                                    Uygula
                                </button>
                                <button onClick={() => { if (window.confirm('Şablonu sil?')) deleteMutation.mutate(t.id); }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                    <HiOutlineTrash className="w-4 h-4" />
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

    return (
        <div className="space-y-4 fade-in">
            <p className="text-sm text-gray-500">Belirtilen eşikleri aşan CPU veya RAM kullanımı Discord webhook üzerinden bildirim gönderir. Aynı uyarı 5 dakikada bir tekrar tetiklenir.</p>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-4 max-w-md">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPU Eşiği (%)</label>
                    <input type="number" min="1" max="100" value={cpu} onChange={e => setCpu(e.target.value)}
                        placeholder="örn: 90 (boş = kapalı)"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RAM Eşiği (%)</label>
                    <input type="number" min="1" max="100" value={ram} onChange={e => setRam(e.target.value)}
                        placeholder="örn: 85 (boş = kapalı)"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <p className="text-xs text-gray-400">Discord webhookunu Discord sayfasından yapılandırın.</p>
                <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="w-full py-2 rounded-xl text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                    {saved ? <><HiOutlineCheck className="w-4 h-4" /> Kaydedildi</> : saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
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

    // Kullanıcı bazlı aktivite özeti
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

    const ACTION_COLORS = {
        sunucu_baslat:         'text-emerald-600 bg-emerald-50',
        sunucu_durdur:         'text-gray-600 bg-gray-100',
        sunucu_yeniden_baslat: 'text-amber-600 bg-amber-50',
        oyuncu_ban:            'text-red-600 bg-red-50',
        oyuncu_ban_kaldir:     'text-blue-600 bg-blue-50',
        ip_ban:                'text-red-600 bg-red-50',
        ip_ban_kaldir:         'text-blue-600 bg-blue-50',
    };

    const logs = data?.logs || [];

    return (
        <div className="space-y-4 fade-in">
            {/* Kullanıcı aktivite özeti */}
            {userSummary.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {userSummary.map(u => (
                        <div key={u.user} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.user}</span>
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">{u.count}</span>
                            </div>
                            <p className="text-xs text-gray-400 truncate">{u.lastAction.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-gray-300 dark:text-gray-600">
                                {new Date(u.lastAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-3">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Kullanıcıya göre filtrele..."
                    className="flex-1 max-w-xs px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="text-xs text-gray-400">{logs.length} kayıt</span>
                <button onClick={() => { if (window.confirm('Tüm audit logları silinsin mi?')) clearMutation.mutate(); }}
                    className="px-3 py-2 text-xs font-medium rounded-xl text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1">
                    <HiOutlineTrash className="w-3.5 h-3.5" /> Temizle
                </button>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-10 text-center">
                        <HiOutlineClipboardDocumentList className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-400">Henüz kayıt yok.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[500px] overflow-y-auto">
                        {logs.map(log => (
                            <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ACTION_COLORS[log.action] || 'text-indigo-600 bg-indigo-50'}`}>
                                    {log.action.replace(/_/g, ' ')}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{log.user}</span>
                                    {log.details && <span className="text-sm text-gray-400 ml-2 truncate">{log.details}</span>}
                                </div>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                    {new Date(log.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
