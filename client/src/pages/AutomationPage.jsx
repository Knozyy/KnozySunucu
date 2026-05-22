import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineBolt, HiOutlineClock, HiOutlineTrash, HiOutlinePlus,
    HiOutlineXMark, HiOutlineExclamationTriangle, HiOutlineCheckCircle,
    HiOutlineArrowPath,
} from 'react-icons/hi2';

// ── Yardımcı ──────────────────────────────────────────────────────────────────
function formatExpiry(ts) {
    return new Date(ts * 1000).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function timeRemaining(ts) {
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'Süresi doldu';
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (d > 0) return `${d} gün ${h} sa`;
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
}

function msToHuman(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AutomationPage() {
    const [activeTab, setActiveTab] = useState('whitelist');

    const tabs = [
        { id: 'whitelist', label: 'Süreli Whitelist', icon: HiOutlineClock },
        { id: 'restart', label: 'Restart Sayacı', icon: HiOutlineBolt },
    ];

    return (
        <div className="space-y-6">
            <div className="fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                    <HiOutlineBolt className="w-7 h-7 text-amber-500" />
                    Otomasyon
                </h1>
                <p className="text-sm text-gray-500">Zamanlanmış işlemler ve otomatik kurallar</p>
            </div>

            <div className="flex gap-2 fade-in flex-wrap">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'whitelist' && <TimedWhitelistPanel />}
            {activeTab === 'restart' && <RestartCountdownPanel />}
        </div>
    );
}

// ══ Süreli Whitelist ══════════════════════════════════════════════════════════
function TimedWhitelistPanel() {
    const queryClient = useQueryClient();
    const [nick, setNick] = useState('');
    const [days, setDays] = useState('');
    const [hours, setHours] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['timed-whitelist'],
        queryFn: () => api.get('/automation/timed-whitelist').then(r => r.data),
        refetchInterval: 30000,
    });

    const addMutation = useMutation({
        mutationFn: () => api.post('/automation/timed-whitelist', {
            mcNick: nick.trim(),
            durationDays: Number(days) || 0,
            durationHours: Number(hours) || 0,
        }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            setNick(''); setDays(''); setHours('');
            queryClient.invalidateQueries({ queryKey: ['timed-whitelist'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Eklenemedi'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/automation/timed-whitelist/${id}`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['timed-whitelist'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });

    const entries = data?.entries || [];
    const now = Math.floor(Date.now() / 1000);
    const active = entries.filter(e => e.expires_at > now);
    const expired = entries.filter(e => e.expires_at <= now);

    return (
        <div className="space-y-4 fade-in">
            {/* Başlık + açıklama */}
            <div className="glass-card p-5">
                <div className="flex items-start gap-3">
                    <HiOutlineClock className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white">Süreli Whitelist Erişimi</h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Bir oyuncuya geçici MC whitelist izni ver. Süre dolunca otomatik çıkarılır.
                        </p>
                    </div>
                </div>
            </div>

            {/* Ekle formu */}
            <div className="glass-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Yeni Geçici Erişim</p>
                <div className="flex gap-2 flex-wrap items-end">
                    <div className="flex-1 min-w-36">
                        <label className="block text-xs text-gray-500 mb-1">Minecraft Nick</label>
                        <input
                            type="text"
                            value={nick}
                            onChange={e => setNick(e.target.value)}
                            placeholder="oyuncu_nick"
                            className="input-field font-mono text-sm"
                        />
                    </div>
                    <div className="w-24">
                        <label className="block text-xs text-gray-500 mb-1">Gün</label>
                        <input
                            type="number"
                            value={days}
                            onChange={e => setDays(e.target.value)}
                            placeholder="0"
                            min="0"
                            className="input-field text-sm"
                        />
                    </div>
                    <div className="w-24">
                        <label className="block text-xs text-gray-500 mb-1">Saat</label>
                        <input
                            type="number"
                            value={hours}
                            onChange={e => setHours(e.target.value)}
                            placeholder="0"
                            min="0"
                            max="23"
                            className="input-field text-sm"
                        />
                    </div>
                    <button
                        onClick={() => addMutation.mutate()}
                        disabled={addMutation.isPending || !nick.trim() || (!Number(days) && !Number(hours))}
                        className="btn-primary text-sm flex items-center gap-1.5 h-10"
                    >
                        <HiOutlinePlus className="w-4 h-4" />
                        {addMutation.isPending ? 'Ekleniyor...' : 'Ekle'}
                    </button>
                </div>
            </div>

            {/* Liste */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {active.length} Aktif &nbsp;·&nbsp; {expired.length} Süresi Dolmuş
                    </span>
                    <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['timed-whitelist'] })}
                        className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <HiOutlineArrowPath className="w-3.5 h-3.5" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                        Yükleniyor...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <HiOutlineClock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">Henüz geçici erişim yok</p>
                    </div>
                ) : (
                    entries.map((entry, i) => {
                        const isExpired = entry.expires_at <= now;
                        return (
                            <div
                                key={entry.id}
                                className={`flex items-center gap-3 px-5 py-3.5 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${i !== entries.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''} ${isExpired ? 'opacity-50' : ''}`}
                            >
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isExpired ? 'bg-gray-300' : 'bg-green-400 animate-pulse'}`} />
                                <img
                                    src={`https://mc-heads.net/avatar/${entry.mc_nick}/28`}
                                    alt={entry.mc_nick}
                                    className="w-7 h-7 rounded-md flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.mc_nick}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {isExpired ? '⏹ Süresi doldu' : `⏳ ${timeRemaining(entry.expires_at)} kaldı`}
                                        {' · '}{formatExpiry(entry.expires_at)}
                                    </p>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isExpired ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                                    {isExpired ? 'Doldu' : 'Aktif'}
                                </span>
                                <button
                                    onClick={() => deleteMutation.mutate(entry.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    title="Sil ve whitelist'ten çıkar"
                                >
                                    <HiOutlineTrash className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ══ Restart Sayacı ════════════════════════════════════════════════════════════
function RestartCountdownPanel() {
    const queryClient = useQueryClient();
    const [delayMinutes, setDelayMinutes] = useState('60');
    const [selectedWarnings, setSelectedWarnings] = useState([30, 10, 5, 1]);
    const WARNING_OPTIONS = [60, 30, 15, 10, 5, 1];

    const { data, isLoading } = useQuery({
        queryKey: ['restart-countdowns'],
        queryFn: () => api.get('/automation/restart-countdown').then(r => r.data),
        refetchInterval: 10000,
    });

    const startMutation = useMutation({
        mutationFn: () => api.post('/automation/restart-countdown', {
            delayMinutes: Number(delayMinutes),
            warnings: selectedWarnings,
        }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['restart-countdowns'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Başlatılamadı'),
    });

    const cancelMutation = useMutation({
        mutationFn: (id) => api.delete(`/automation/restart-countdown/${id}`),
        onSuccess: () => {
            toast.success('Sayaç iptal edildi.');
            queryClient.invalidateQueries({ queryKey: ['restart-countdowns'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'İptal edilemedi'),
    });

    const toggleWarning = (w) => {
        setSelectedWarnings(prev =>
            prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w].sort((a, b) => b - a)
        );
    };

    const countdowns = data?.countdowns || [];

    return (
        <div className="space-y-4 fade-in">
            {/* Açıklama */}
            <div className="glass-card p-5">
                <div className="flex items-start gap-3">
                    <HiOutlineBolt className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white">Zamanlanmış Yeniden Başlatma</h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Sayaç başlatılınca seçili dakikalarda oyunculara otomatik uyarı mesajı atılır,
                            süre dolunca sunucu yeniden başlar.
                        </p>
                    </div>
                </div>
            </div>

            {/* Kurulum formu */}
            <div className="glass-card p-5 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Yeni Sayaç Başlat</p>

                <div className="flex gap-4 flex-wrap items-end">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Restart süresi (dakika)</label>
                        <input
                            type="number"
                            value={delayMinutes}
                            onChange={e => setDelayMinutes(e.target.value)}
                            min="1"
                            className="input-field w-32 text-sm"
                        />
                    </div>
                    <div className="text-xs text-gray-400 pb-2">
                        ≈ {Math.floor(Number(delayMinutes) / 60) > 0 ? `${Math.floor(Number(delayMinutes) / 60)} sa ` : ''}{Number(delayMinutes) % 60} dk sonra restart
                    </div>
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-2">Uyarı mesajları gönder (dakika kala)</label>
                    <div className="flex flex-wrap gap-2">
                        {WARNING_OPTIONS.map(w => {
                            const tooLong = w >= Number(delayMinutes);
                            const selected = selectedWarnings.includes(w) && !tooLong;
                            return (
                                <button
                                    key={w}
                                    onClick={() => !tooLong && toggleWarning(w)}
                                    disabled={tooLong}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                                        tooLong
                                            ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                            : selected
                                                ? 'border-amber-400 bg-amber-50 text-amber-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                    }`}
                                >
                                    {w} dk
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending || !Number(delayMinutes)}
                    className="btn-primary flex items-center gap-2"
                >
                    <HiOutlineBolt className="w-4 h-4" />
                    {startMutation.isPending ? 'Başlatılıyor...' : 'Sayacı Başlat'}
                </button>
            </div>

            {/* Aktif sayaçlar */}
            {isLoading ? null : countdowns.length > 0 && (
                <div className="glass-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {countdowns.length} Aktif Sayaç
                        </span>
                    </div>
                    {countdowns.map((c, i) => (
                        <div
                            key={c.id}
                            className={`flex items-center gap-4 px-5 py-4 ${i !== countdowns.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <HiOutlineExclamationTriangle className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {c.delayMinutes} dakikalık restart sayacı
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Kalan: <span className="font-mono font-semibold text-amber-600">{msToHuman(c.remainingMs)}</span>
                                    &nbsp;·&nbsp;
                                    Uyarılar: {c.warnings.length > 0 ? c.warnings.map(w => `${w}dk`).join(', ') : 'Yok'}
                                </p>
                                {/* Progress bar */}
                                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-64">
                                    <div
                                        className="h-full bg-amber-400 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.max(0, Math.min(100, 100 - (c.remainingMs / (c.delayMinutes * 60 * 1000)) * 100))}%` }}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => cancelMutation.mutate(c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all"
                            >
                                <HiOutlineXMark className="w-3.5 h-3.5" />
                                İptal Et
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && countdowns.length === 0 && (
                <div className="glass-card p-8 text-center text-gray-400">
                    <HiOutlineCheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Aktif restart sayacı yok</p>
                </div>
            )}
        </div>
    );
}
