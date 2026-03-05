import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineArrowPath,
    HiOutlineCpuChip,
    HiOutlineUsers, HiOutlineShieldCheck, HiOutlineNoSymbol,
    HiOutlineUserPlus, HiOutlineTrash,
} from 'react-icons/hi2';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('players');
    const { t } = useI18n();

    const tabs = [
        { id: 'players', label: 'Oyuncu Yönetimi', icon: HiOutlineUsers },
        { id: 'tasks', label: 'Görev Yöneticisi', icon: HiOutlineCpuChip },
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
            <div className="flex gap-2 fade-in">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}>
                        <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'players' ? (
                <PlayersPanel />
            ) : (
                <TaskManagerPanel />
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
