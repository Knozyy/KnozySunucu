import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineClock, HiOutlineTrash, HiOutlinePlus,
    HiOutlinePlay, HiOutlinePause, HiOutlineDocumentText,
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

function CountdownTimer({ nextRunStr, enabled }) {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!enabled || !nextRunStr) { setTimeLeft(0); return; }
        const nextRun = parseInt(nextRunStr, 10);
        const updateTimer = () => {
            const diff = nextRun - Date.now();
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
    const [showLog, setShowLog] = useState(false);
    const [form, setForm] = useState({ name: '', action: 'restart', intervalMinutes: 360, type: 'interval', actionData: {} });
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data } = useQuery({
        queryKey: ['scheduler'],
        queryFn: () => api.get('/scheduler').then(r => r.data),
        refetchInterval: 30000,
    });

    const { data: logData } = useQuery({
        queryKey: ['schedulerLog'],
        queryFn: () => api.get('/scheduler/log').then(r => r.data),
        enabled: showLog,
        refetchInterval: showLog ? 5000 : false,
    });

    const createMutation = useMutation({
        mutationFn: (data) => api.post('/scheduler', data),
        onSuccess: () => {
            toast.success('Görev oluşturuldu');
            setShowForm(false);
            setForm({ name: '', action: 'restart', intervalMinutes: 360, type: 'interval', actionData: {} });
            queryClient.invalidateQueries({ queryKey: ['scheduler'] });
        },
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
        clear_items: '🗑️ Yerdeki Eşyaları Sil',
        custom_command: '⚡ Özel Komut Çalıştır'
    };

    const [formInput, setFormInput] = useState({
        intervalValue: 6,
        intervalUnit: 'hours', // 'minutes' veya 'hours'
    });

    const handleFormSubmit = () => {
        let finalMinutes = formInput.intervalValue;
        if (formInput.intervalUnit === 'hours') {
            finalMinutes = formInput.intervalValue * 60;
        }

        const dataToSubmit = {
            ...form,
            intervalMinutes: finalMinutes,
        };

        createMutation.mutate(dataToSubmit);
    };

    return (
        <div className="space-y-6">
            <div className="fade-in flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('scheduler.title')}</h1>
                    <p className="text-gray-500">{t('scheduler.subtitle')}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowLog(!showLog)}
                        className={`btn-secondary text-sm ${showLog ? 'ring-2 ring-blue-400' : ''}`}
                    >
                        <HiOutlineDocumentText className="w-4 h-4" /> Log
                    </button>
                    <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                        <HiOutlinePlus className="w-5 h-5" /> Yeni Görev
                    </button>
                </div>
            </div>

            {/* Execution Log */}
            {showLog && (
                <div className="glass-card p-4 fade-in">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <HiOutlineDocumentText className="w-4 h-4 text-blue-600" />
                        Görev Çalışma Geçmişi
                    </h3>
                    <div className="max-h-60 overflow-y-auto bg-gray-900 rounded-xl p-3 text-xs font-mono space-y-1">
                        {logData?.log?.length > 0 ? (
                            [...logData.log].reverse().map((entry, i) => (
                                <div key={i} className={`px-2 py-0.5 rounded ${entry.message.includes('HATA') || entry.message.includes('hatası') ? 'text-red-400 bg-red-900/10' :
                                    entry.message.includes('başarıyla') || entry.message.includes('tamamlandı') || entry.message.includes('temizlendi') ? 'text-green-400' :
                                        entry.message.includes('atlandı') ? 'text-amber-400' :
                                            'text-gray-400'
                                    }`}>
                                    <span className="text-gray-600">{new Date(entry.time).toLocaleString('tr-TR')}</span>
                                    {' '}
                                    <span className="text-cyan-400">[{entry.task}]</span>
                                    {' '}
                                    {entry.message}
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-500 text-center py-4">
                                Henüz çalışma kaydı yok. Görev çalıştığında burada gözükecek.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showForm && (
                <div className="glass-card p-6 fade-in">
                    <h3 className="font-semibold text-gray-900 mb-4">Yeni Görev</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Görev Adı</label>
                            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Örn: Otomatik restart" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">İşlem</label>
                            <select value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))} className="input-field">
                                <option value="restart">Sunucu Yeniden Başlat</option>
                                <option value="backup">Yedek Al</option>
                                <option value="announce">Oyun İçi Duyuru</option>
                                <option value="clear_items">Yerdeki Eşyaları Sil (Clear Items)</option>
                                <option value="custom_command">Özel Komut Çalıştır</option>
                                <option value="webhook">Discord Webhook</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tekrar Süresi</label>
                            <div className="flex gap-2">
                                <input type="number"
                                    className="input-field flex-1" min={1}
                                    value={formInput.intervalValue}
                                    onChange={e => setFormInput(p => ({ ...p, intervalValue: parseInt(e.target.value) || 1 }))}
                                />
                                <select
                                    className="input-field w-28"
                                    value={formInput.intervalUnit}
                                    onChange={e => setFormInput(p => ({ ...p, intervalUnit: e.target.value }))}
                                >
                                    <option value="minutes">Dakika</option>
                                    <option value="hours">Saat</option>
                                </select>
                            </div>
                        </div>
                        {(form.action === 'announce' || form.action === 'webhook' || form.action === 'custom_command') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {form.action === 'announce' ? 'Duyuru Mesajı' : form.action === 'custom_command' ? 'Özel Sunucu Komutu' : 'Webhook URL'}
                                </label>
                                <input type="text"
                                    value={form.action === 'announce' ? (form.actionData.message || '') : form.action === 'custom_command' ? (form.actionData.command || '') : (form.actionData.url || '')}
                                    onChange={e => setForm(p => ({ ...p, actionData: form.action === 'announce' ? { message: e.target.value } : form.action === 'custom_command' ? { command: e.target.value } : { url: e.target.value, message: form.name } }))}
                                    className="input-field"
                                    placeholder={form.action === 'announce' ? 'Sunucu 5 dakika içinde kapanacak!' : form.action === 'custom_command' ? 'say Komut testi && kill @a' : 'https://discord.com/api/webhooks/...'}
                                />
                                {form.action === 'custom_command' && <p className="text-xs text-gray-500 mt-1">Başına '/' koymanıza gerek yoktur.</p>}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 mt-4 justify-end">
                        <button onClick={() => setShowForm(false)} className="btn-secondary">İptal</button>
                        <button onClick={handleFormSubmit} disabled={!form.name || createMutation.isPending} className="btn-primary">
                            {createMutation.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
                        </button>
                    </div>
                </div>
            )}

            {/* Task List */}
            <div className="space-y-3">
                {tasks.length > 0 ? tasks.map(task => {
                    // Dakikayı daha güzel formatlama logic
                    let displayInterval = `${task.interval_minutes} dakika`;
                    if (task.interval_minutes >= 60 && task.interval_minutes % 60 === 0) {
                        displayInterval = `${task.interval_minutes / 60} saat`;
                    }

                    return (
                        <div key={task.id} className="glass-card p-5 fade-in flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${task.enabled ? 'bg-green-50' : 'bg-gray-100'}`}>
                                <HiOutlineClock className={`w-5 h-5 ${task.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-gray-900">
                                    {task.name}
                                    {task.action === 'custom_command' && task.action_data && (
                                        <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                                            /{JSON.parse(task.action_data).command}
                                        </span>
                                    )}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {actionLabels[task.action] || task.action} • Her {displayInterval}'da
                                </p>
                                <div className="flex items-center gap-4 mt-1.5">
                                    {task.last_run && <p className="text-xs text-gray-400">Son: {new Date(task.last_run).toLocaleString('tr-TR')}</p>}
                                    <p className="text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
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
                    );
                }) : (
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
