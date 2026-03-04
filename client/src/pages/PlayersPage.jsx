import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineUserPlus, HiOutlineTrash, HiOutlineShieldCheck,
    HiOutlineNoSymbol, HiOutlineUsers,
} from 'react-icons/hi2';

export default function PlayersPage() {
    const [activeTab, setActiveTab] = useState('whitelist');
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

    const tabs = [
        { id: 'whitelist', label: 'Whitelist', icon: HiOutlineUsers, count: whitelist?.players?.length || 0 },
        { id: 'ops', label: 'Operatörler', icon: HiOutlineShieldCheck, count: ops?.players?.length || 0 },
        { id: 'banned', label: 'Banlı', icon: HiOutlineNoSymbol, count: banned?.players?.length || 0 },
    ];

    const handleAdd = () => {
        if (!newName.trim()) return;
        if (activeTab === 'whitelist') addWhitelist.mutate(newName.trim());
        else if (activeTab === 'ops') addOp.mutate(newName.trim());
        else banPlayer.mutate(newName.trim());
    };

    const getList = () => {
        if (activeTab === 'whitelist') return whitelist?.players || [];
        if (activeTab === 'ops') return ops?.players || [];
        return banned?.players || [];
    };

    const handleRemove = (name) => {
        if (activeTab === 'whitelist') removeWhitelist.mutate(name);
        else if (activeTab === 'ops') removeOp.mutate(name);
        else unbanPlayer.mutate(name);
    };

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('players.title')}</h1>
                <p className="text-gray-500">{t('players.subtitle')}</p>
            </div>

            <div className="flex gap-2 fade-in">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                    >
                        <tab.icon className="w-4 h-4" /> {tab.label} ({tab.count})
                    </button>
                ))}
            </div>

            {/* Add player */}
            <div className="glass-card p-4 fade-in">
                <div className="flex gap-3">
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                        className="input-field flex-1" placeholder="Oyuncu adı..."
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                    />
                    <button onClick={handleAdd} className="btn-primary">
                        <HiOutlineUserPlus className="w-5 h-5" /> Ekle
                    </button>
                </div>
            </div>

            {/* Player list */}
            <div className="glass-card overflow-hidden fade-in">
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
