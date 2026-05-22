import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineServerStack, HiOutlinePlus, HiOutlinePencil,
    HiOutlineTrash, HiOutlineCheckCircle, HiOutlineArrowPath,
    HiOutlineXMark, HiOutlineCheck, HiOutlineLightBulb,
    HiOutlineCpuChip, HiOutlineCircleStack, HiOutlineSignal,
} from 'react-icons/hi2';

const RAM_OPTIONS = ['512M', '1G', '2G', '3G', '4G', '6G', '8G', '10G', '12G', '16G', '24G', '32G'];

// ── Kaynak öneri paneli ──────────────────────────────────────────────────────
function RecommendationPanel({ rec }) {
    if (!rec) return null;
    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <HiOutlineLightBulb className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Sistem Önerileri
                </span>
            </div>

            {/* Port */}
            <div className="flex items-start gap-2.5">
                <HiOutlineSignal className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Önerilen Port: <span className="font-bold text-blue-600 dark:text-blue-400">{rec.suggestedPort}</span>
                    </p>
                    {rec.usedPorts?.length > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                            Kullanımda: {rec.usedPorts.join(', ')}
                        </p>
                    )}
                </div>
            </div>

            {/* RAM */}
            <div className="flex items-start gap-2.5">
                <HiOutlineCircleStack className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Önerilen Maks RAM: <span className="font-bold text-blue-600 dark:text-blue-400">{rec.recommendedMaxRam}</span>
                        <span className="text-gray-400 font-normal ml-1">
                            (Min: {rec.recommendedMinRam})
                        </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Toplam RAM: {rec.totalRamGB}GB · Diğer sunucular: {rec.usedRamGB}GB · OS rezerv: 2GB · Kalan: {rec.freeRamGB}GB
                    </p>
                </div>
            </div>

            {/* CPU */}
            <div className="flex items-start gap-2.5">
                <HiOutlineCpuChip className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        İşlemci: <span className="font-bold text-blue-600 dark:text-blue-400">
                            {rec.suggestedCores} çekirdek
                        </span>
                        {rec.serverCount > 0 && (
                            <span className="text-gray-400 font-normal ml-1">
                                (çekirdek {rec.suggestedCoreRange})
                            </span>
                        )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Toplam {rec.totalCores} çekirdek · Java büyük ölçüde tek çekirdekte çalışır, çekirdekler otomatik bölünür
                    </p>
                </div>
            </div>

            {rec.freeRamGB < 2 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                    ⚠ Mevcut RAM yetersiz olabilir. Sunucu performansı düşebilir.
                </p>
            )}
        </div>
    );
}

// ── Sunucu Ekle/Düzenle Modalı ───────────────────────────────────────────────
function ServerModal({ initial, onClose, onSaved }) {
    const [form, setForm] = useState({
        name:     initial?.name     || '',
        path:     initial?.path     || '',
        port:     initial?.port     || 25565,
        min_ram:  initial?.min_ram  || '2G',
        max_ram:  initial?.max_ram  || '4G',
        jvm_args: initial?.jvm_args || '',
    });
    const [saving, setSaving] = useState(false);
    const isNew = !initial?.id;

    const { data: rec } = useQuery({
        queryKey: ['server-recommendations'],
        queryFn: () => api.get('/servers/recommendations').then(r => r.data),
        enabled: isNew,
        staleTime: 30000,
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.name.trim()) return toast.error('Sunucu adı gerekli');
        if (!form.path.trim()) return toast.error('Sunucu yolu gerekli');
        setSaving(true);
        try {
            if (initial?.id) {
                await api.put(`/servers/${initial.id}`, form);
                toast.success('Sunucu güncellendi');
            } else {
                await api.post('/servers', form);
                toast.success('Sunucu eklendi');
            }
            onSaved();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Hata');
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {initial?.id ? 'Sunucuyu Düzenle' : 'Yeni Sunucu Ekle'}
                    </h3>
                    <button onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                        <HiOutlineXMark className="w-5 h-5" />
                    </button>
                </div>

                {isNew && rec && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
                        Önerilen port: <strong>{rec.suggestedPort}</strong>
                    </div>
                )}

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Sunucu Adı</label>
                        <input
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            placeholder="Örn: Survival Sunucu"
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Sunucu Yolu</label>
                        <input
                            value={form.path}
                            onChange={e => set('path', e.target.value)}
                            placeholder="/home/minecraft/server"
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1 font-mono">
                            server.jar dosyasının bulunduğu tam yol (ör. <code>/home/mc/server</code>)
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">
                            Port
                            {rec && isNew && (
                                <span className="ml-2 text-blue-500 font-normal">(Öneri: {rec.suggestedPort})</span>
                            )}
                        </label>
                        <input
                            type="number"
                            value={form.port}
                            onChange={e => set('port', parseInt(e.target.value))}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">JVM Argümanları (isteğe bağlı)</label>
                        <input
                            value={form.jvm_args}
                            onChange={e => set('jvm_args', e.target.value)}
                            placeholder="-Xmx4G -Xms2G -XX:+UseG1GC"
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">RAM ayarı için: -Xmx4G -Xms2G (4GB maks, 2GB min)</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose}
                        className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                        İptal
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                        {saving
                            ? <HiOutlineArrowPath className="w-4 h-4 animate-spin" />
                            : <HiOutlineCheck className="w-4 h-4" />}
                        Kaydet
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Ana sayfa ────────────────────────────────────────────────────────────────
export default function ServersPage() {
    const qc = useQueryClient();
    const [modal, setModal] = useState(null); // null | 'add' | server object

    const { data, isLoading } = useQuery({
        queryKey: ['servers'],
        queryFn: () => api.get('/servers').then(r => r.data),
    });

    const activateMutation = useMutation({
        mutationFn: (id) => api.post(`/servers/${id}/activate`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            qc.invalidateQueries({ queryKey: ['servers'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Geçiş yapılamadı'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/servers/${id}`),
        onSuccess: () => {
            toast.success('Sunucu silindi');
            qc.invalidateQueries({ queryKey: ['servers'] });
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });

    const servers = data?.servers || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sunucular</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Birden fazla Minecraft sunucusunu yönet
                    </p>
                </div>
                <button
                    onClick={() => setModal('add')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                    <HiOutlinePlus className="w-4 h-4" /> Yeni Sunucu
                </button>
            </div>

            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2].map(i => <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
                </div>
            ) : servers.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
                    <HiOutlineServerStack className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500 mb-1">Henüz sunucu yok</p>
                    <p className="text-sm text-gray-400">Yeni Sunucu butonuna tıklayarak ekleyin</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {servers.map(server => (
                        <div key={server.id} className={`bg-white dark:bg-gray-900 rounded-2xl border p-5 space-y-3 transition-all ${
                            server.is_active
                                ? 'border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-100 dark:ring-indigo-900'
                                : 'border-gray-100 dark:border-gray-800'
                        }`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        server.is_active
                                            ? 'bg-indigo-100 dark:bg-indigo-900/40'
                                            : 'bg-gray-100 dark:bg-gray-800'
                                    }`}>
                                        <HiOutlineServerStack className={`w-5 h-5 ${
                                            server.is_active ? 'text-indigo-600' : 'text-gray-400'
                                        }`} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                                            {server.name}
                                        </h3>
                                        {server.is_active && (
                                            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                                ● Birincil
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setModal(server)}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                        <HiOutlinePencil className="w-4 h-4" />
                                    </button>
                                    {!server.is_active && (
                                        <button
                                            onClick={() => window.confirm(`"${server.name}" silinsin mi?`) && deleteMutation.mutate(server.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                            <HiOutlineTrash className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                <p className="font-mono truncate" title={server.path}>{server.path}</p>
                                <p>
                                    Port: <span className="font-medium text-gray-700 dark:text-gray-300">{server.port}</span>
                                    &nbsp;·&nbsp;
                                    RAM: <span className="font-medium text-gray-700 dark:text-gray-300">{server.min_ram} – {server.max_ram}</span>
                                </p>
                                <p className="text-gray-400">Screen: knozy-mc{server.id}</p>
                            </div>

                            {!server.is_active && (
                                <button
                                    onClick={() => activateMutation.mutate(server.id)}
                                    disabled={activateMutation.isPending}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-60">
                                    <HiOutlineCheckCircle className="w-4 h-4" /> Birincil Yap
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {modal && (
                <ServerModal
                    initial={modal === 'add' ? null : modal}
                    onClose={() => setModal(null)}
                    onSaved={() => {
                        qc.invalidateQueries({ queryKey: ['servers'] });
                        setModal(null);
                    }}
                />
            )}
        </div>
    );
}
