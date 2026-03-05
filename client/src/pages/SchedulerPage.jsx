import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineClock, HiOutlineTrash, HiOutlinePlus,
    HiOutlinePlay, HiOutlinePause,
} from 'react-icons/hi2';

function formatCountdown(ms) {
    if (ms <= 0) return "Çalışıyor / Bekliyor...";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) return `${h}s ${m}d ${s}sn`;
    return `${m}d ${s}sn`;
}

// Lokal Geri Sayım Bileşeni
function CountdownTimer({ nextRunStr, enabled }) {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!enabled || !nextRunStr) {
            setTimeLeft(0);
            return;
        }

        const nextRun = parseInt(nextRunStr, 10);

        const updateTimer = () => {
            const now = Date.now();
            const diff = nextRun - now;
            setTimeLeft(Math.max(0, diff));
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [nextRunStr, enabled]);

    if (!enabled) return <span className="text-gray-400">Görev durduruldu</span>;
    if (!nextRunStr) return <span className="text-amber-500">Planlanıyor...</span>;

    return (
        <span className={`font-mono ${timeLeft < 60000 && timeLeft > 0 ? 'text-amber-600 font-bold' : 'text-blue-600'}`}>
            {formatCountdown(timeLeft)}
        </span>
    );
}

export default function SchedulerPage() {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', action: 'restart', intervalMinutes: 360, type: 'interval', actionData: {} });
    const queryClient = useQueryClient();

    const { data } = useQuery({ queryKey: ['scheduler'], queryFn: () => api.get('/scheduler').then(r => r.data) });

    const createMutation = useMutation({
        mutationFn: (data) => api.post('/scheduler', data),
        onSuccess: () => { toast.success('Görev oluşturuldu'); setShowForm(false); setForm({ name: '', action: 'restart', intervalMinutes: 360, type: 'interval', actionData: {} }); queryClient.invalidateQueries({ queryKey: ['scheduler'] }); },
        onError: (err) => toast.error(err.response?.data?.error || 'Oluşturulamadı'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/scheduler/${id}`),
        onSuccess: () => { toast.success('Görev silindi'); queryClient.invalidateQueries({ queryKey: ['scheduler'] }); },
    });

    const toggleMutation = useMutation({
        mutationFn: (id) => api.post(`/scheduler/${id}/toggle`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
    });

    const tasks = data?.tasks || [];

    const actionLabels = {
        restart: '🔄 Yeniden Başlat',
        backup: '💾 Yedek Al',
        announce: '📢 Duyuru Yap',
        webhook: '🔔 Webhook Gönder',
    };

    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('scheduler.title')}</h1>
                    <p className="text-gray-500">{t('scheduler.subtitle')}</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                    <HiOutlinePlus className="w-5 h-5" /> Yeni Görev
                </button>
            </div>

            {showForm && (
                <div className="glass-card p-6 fade-in">
                    <h3 className="font-semibold text-gray-900 mb-4">Yeni Görev</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Görev Adı</label>
                            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Otomatik restart" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">İşlem</label>
                            <select value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))} className="input-field">
                                <option value="restart">Sunucu Yeniden Başlat</option>
                                <option value="backup">Yedek Al</option>
                                <option value="announce">Oyun İçi Duyuru</option>
                                <option value="webhook">Discord Webhook</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tekrar Süresi (dk)</label>
                            <input type="number" value={form.intervalMinutes} onChange={e => setForm(p => ({ ...p, intervalMinutes: parseInt(e.target.value) || 60 }))} className="input-field" min={1} />
                        </div>
                        {(form.action === 'announce' || form.action === 'webhook') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {form.action === 'announce' ? 'Duyuru Mesajı' : 'Webhook URL'}
                                </label>
                                <input type="text"
                                    value={form.action === 'announce' ? (form.actionData.message || '') : (form.actionData.url || '')}
                                    onChange={e => setForm(p => ({ ...p, actionData: form.action === 'announce' ? { message: e.target.value } : { url: e.target.value, message: form.name } }))}
                                    className="input-field"
                                    placeholder={form.action === 'announce' ? 'Sunucu 5 dakika içinde yeniden başlayacak!' : 'https://discord.com/api/webhooks/...'}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 mt-4 justify-end">
                        <button onClick={() => setShowForm(false)} className="btn-secondary">İptal</button>
                        <button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending} className="btn-primary">
                            {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
                        </button>
                    </div>
                </div>
            )}

            {/* Task List */}
            <div className="space-y-3">
                {tasks.length > 0 ? tasks.map(task => (
                    <div key={task.id} className="glass-card p-5 fade-in flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${task.enabled ? 'bg-green-50' : 'bg-gray-100'}`}>
                            <HiOutlineClock className={`w-5 h-5 ${task.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-gray-900">{task.name}</p>
                            <p className="text-sm text-gray-500">
                                {actionLabels[task.action] || task.action} • Her {task.interval_minutes} dakikada
                            </p>
                            <div className="flex items-center gap-4 mt-1.5">
                                {task.last_run && <p className="text-xs text-gray-400">Son: {new Date(task.last_run).toLocaleString('tr-TR')}</p>}
                                <p className="text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
                                    Sonraki: <CountdownTimer nextRunStr={task.next_run} enabled={task.enabled} />
                                </p>
                            </div>
                        </div>
                        <button onClick={() => toggleMutation.mutate(task.id)}
                            className={`p-2 rounded-lg transition-colors ${task.enabled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        >
                            {task.enabled ? <HiOutlinePause className="w-5 h-5" /> : <HiOutlinePlay className="w-5 h-5" />}
                        </button>
                        <button onClick={() => deleteMutation.mutate(task.id)} className="text-red-400 hover:text-red-600 transition-colors p-2">
                            <HiOutlineTrash className="w-5 h-5" />
                        </button>
                    </div>
                )) : (
                    <div className="text-center py-12 text-gray-400">
                        <HiOutlineClock className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-lg">Henüz zamanlanmış görev yok</p>
                        <p className="text-sm">Otomatik restart, yedek veya duyuru planlayın</p>
                    </div>
                )}
            </div>
        </div>
    );
}
