import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineArrowPath,
    HiOutlineCpuChip,
    HiOutlineUsers, HiOutlineShieldCheck, HiOutlineNoSymbol,
    HiOutlineUserPlus, HiOutlineTrash, HiOutlinePlus, HiOutlinePencil,
    HiOutlineCheck, HiOutlineXMark, HiOutlineTag,
} from 'react-icons/hi2';

// ── Tüm izin verilebilir sayfalar ─────────────────────────────────────────────
const ALL_PAGES = [
    { key: 'console',   label: 'Konsol',       emoji: '💻' },
    { key: 'terminal',  label: 'Terminal',      emoji: '⌨️' },
    { key: 'worlds',    label: 'Dünyalar',      emoji: '🌍' },
    { key: 'files',     label: 'Dosyalar',      emoji: '📁' },
    { key: 'modpacks',  label: 'Modpackler',    emoji: '📦' },
    { key: 'mods',      label: 'Modlar',        emoji: '🧩' },
    { key: 'scheduler', label: 'Görevler',      emoji: '⏰' },
    { key: 'backup',    label: 'Yedekleme',     emoji: '💾' },
    { key: 'discord',   label: 'Discord Bot',   emoji: '🤖' },
];

const PRESET_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('players');
    const { t } = useI18n();

    const tabs = [
        { id: 'players', label: 'Oyuncu Yönetimi', icon: HiOutlineUsers },
        { id: 'tasks', label: 'Görev Yöneticisi', icon: HiOutlineCpuChip },
        { id: 'users', label: 'Panel Kullanıcıları', icon: HiOutlineShieldCheck },
        { id: 'categories', label: 'İzin Kategorileri', icon: HiOutlineTag },
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

            {activeTab === 'players' && <PlayersPanel />}
            {activeTab === 'tasks' && <TaskManagerPanel />}
            {activeTab === 'users' && <PanelUsersPanel />}
            {activeTab === 'categories' && <CategoriesPanel />}
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
// OYUNCU YÖNETİMİ PANELİ (eski PlayersPage)
// ============================================================
function PlayersPanel() {
    const [activeList, setActiveList] = useState('whitelist');
    const [newName, setNewName] = useState('');
    const queryClient = useQueryClient();

    const { data: whitelist } = useQuery({ queryKey: ['whitelist'], queryFn: () => api.get('/players/whitelist').then(r => r.data) });
    const { data: ops } = useQuery({ queryKey: ['ops'], queryFn: () => api.get('/players/ops').then(r => r.data) });
    const { data: banned } = useQuery({ queryKey: ['banned'], queryFn: () => api.get('/players/banned').then(r => r.data) });

    const addWhitelist = useMutation({
        mutationFn: (name) => api.post('/players/whitelist', { name }),
        onSuccess: () => { toast.success('Whitelist\'e eklendi'); setNewName(''); queryClient.invalidateQueries({ queryKey: ['whitelist'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Eklenemedi'),
    });
    const removeWhitelist = useMutation({
        mutationFn: (name) => api.delete(`/players/whitelist/${name}`),
        onSuccess: () => { toast.success('Çıkarıldı'); queryClient.invalidateQueries({ queryKey: ['whitelist'] }); },
    });
    const addOp = useMutation({
        mutationFn: (name) => api.post('/players/ops', { name }),
        onSuccess: () => { toast.success('OP yapıldı'); setNewName(''); queryClient.invalidateQueries({ queryKey: ['ops'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Eklenemedi'),
    });
    const removeOp = useMutation({
        mutationFn: (name) => api.delete(`/players/ops/${name}`),
        onSuccess: () => { toast.success('OP kaldırıldı'); queryClient.invalidateQueries({ queryKey: ['ops'] }); },
    });
    const banPlayer = useMutation({
        mutationFn: (name) => api.post('/players/ban', { name }),
        onSuccess: () => { toast.success('Banlandı'); setNewName(''); queryClient.invalidateQueries({ queryKey: ['banned'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Banlanamadı'),
    });
    const unbanPlayer = useMutation({
        mutationFn: (name) => api.delete(`/players/ban/${name}`),
        onSuccess: () => { toast.success('Ban kaldırıldı'); queryClient.invalidateQueries({ queryKey: ['banned'] }); },
    });

    const listTabs = [
        { id: 'whitelist', label: 'Whitelist', icon: HiOutlineUsers, count: whitelist?.players?.length || 0 },
        { id: 'ops', label: 'Operatörler', icon: HiOutlineShieldCheck, count: ops?.players?.length || 0 },
        { id: 'banned', label: 'Banlı', icon: HiOutlineNoSymbol, count: banned?.players?.length || 0 },
    ];

    const handleAdd = () => {
        if (!newName.trim()) return;
        if (activeList === 'whitelist') addWhitelist.mutate(newName.trim());
        else if (activeList === 'ops') addOp.mutate(newName.trim());
        else banPlayer.mutate(newName.trim());
    };

    const getList = () => {
        if (activeList === 'whitelist') return whitelist?.players || [];
        if (activeList === 'ops') return ops?.players || [];
        return banned?.players || [];
    };

    const handleRemove = (name) => {
        if (activeList === 'whitelist') removeWhitelist.mutate(name);
        else if (activeList === 'ops') removeOp.mutate(name);
        else unbanPlayer.mutate(name);
    };

    return (
        <div className="space-y-4 fade-in">
            <div className="flex gap-2 flex-wrap">
                {listTabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveList(tab.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeList === tab.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}>
                        <tab.icon className="w-4 h-4" /> {tab.label} ({tab.count})
                    </button>
                ))}
            </div>

            <div className="glass-card p-4">
                <div className="flex gap-3">
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                        className="input-field flex-1" placeholder="Oyuncu adı..."
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
                    <button onClick={handleAdd} className="btn-primary">
                        <HiOutlineUserPlus className="w-5 h-5" /> Ekle
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                {getList().length > 0 ? getList().map((player, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors group">
                        <img src={`https://mc-heads.net/avatar/${player.name}/32`} alt={player.name} className="w-8 h-8 rounded-lg" loading="lazy" />
                        <span className="text-sm text-gray-900 font-medium flex-1">{player.name}</span>
                        {player.level && <span className="text-xs text-gray-400">Level {player.level}</span>}
                        {player.reason && <span className="text-xs text-red-400 truncate max-w-[200px]">{player.reason}</span>}
                        <button onClick={() => handleRemove(player.name)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                            <HiOutlineTrash className="w-4 h-4" />
                        </button>
                    </div>
                )) : (
                    <div className="p-8 text-center text-gray-400">
                        <HiOutlineUsers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Henüz oyuncu yok</p>
                    </div>
                )}
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
