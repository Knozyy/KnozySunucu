import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/knozy/tokens';
import { Cap, Pill, Card, Input } from '@/knozy/primitives';
import { I } from '@/knozy/icons';

// ── Modal kabuğu (Knozy) ────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 520 }) {
    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4,
                width: '100%', maxWidth, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)', fontFamily: A.sans, color: A.text,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${A.border}`, flexShrink: 0 }}>
                    <Cap>{title}</Cap>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faint }}><I.X size={14} /></button>
                </div>
                <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
            </div>
        </div>
    );
}

// ── Kaynak öneri paneli ──────────────────────────────────────────────────────
function Row({ glyph, color, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color, flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>{glyph}</span>
            <div style={{ fontSize: 12, color: A.dim }}>{children}</div>
        </div>
    );
}

function ModalField({ label, hint, children }) {
    return (
        <div>
            <Cap style={{ display: 'block', marginBottom: 4 }}>{label}</Cap>
            {children}
            {hint && <p style={{ fontSize: 11, color: A.faint, margin: '4px 0 0', fontFamily: A.mono }}>{hint}</p>}
        </div>
    );
}

function RecommendationPanel({ rec }) {
    if (!rec) return null;
    return (
        <div style={{ background: 'rgba(96,165,250,0.08)', border: `1px solid ${A.border}`, borderRadius: 4, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Cap style={{ color: '#60a5fa' }}>Sistem Önerileri</Cap>
            <Row glyph={<I.Signal size={14} />} color="#60a5fa">
                Önerilen Port: <strong style={{ color: A.text }}>{rec.suggestedPort}</strong>
                {rec.usedPorts?.length > 0 && <div style={{ fontSize: 11, color: A.faint, marginTop: 2 }}>Kullanımda: {rec.usedPorts.join(', ')}</div>}
            </Row>
            <Row glyph={<I.RAM size={14} />} color="#a78bfa">
                Önerilen Maks RAM: <strong style={{ color: A.text }}>{rec.recommendedMaxRam}</strong> <span style={{ color: A.faint }}>(Min: {rec.recommendedMinRam})</span>
                <div style={{ fontSize: 11, color: A.faint, marginTop: 2 }}>Toplam {rec.totalRamGB}GB · Diğer sunucular {rec.usedRamGB}GB · OS rezerv 2GB · Kalan {rec.freeRamGB}GB</div>
            </Row>
            <Row glyph={<I.CPU size={14} />} color="#4ade80">
                İşlemci: <strong style={{ color: A.text }}>{rec.suggestedCores} çekirdek</strong>
                {rec.serverCount > 0 && <span style={{ color: A.faint }}> (çekirdek {rec.suggestedCoreRange})</span>}
                <div style={{ fontSize: 11, color: A.faint, marginTop: 2 }}>Toplam {rec.totalCores} çekirdek · Java ağırlıklı tek çekirdek</div>
            </Row>
            {rec.freeRamGB < 2 && (
                <div style={{ fontSize: 11, color: A.warn, background: 'rgba(251,191,36,0.10)', padding: '6px 10px', borderRadius: 3 }}>
                    ⚠ Mevcut RAM yetersiz olabilir. Sunucu performansı düşebilir.
                </div>
            )}
        </div>
    );
}

// ── Sunucu Ekle/Düzenle Modalı ───────────────────────────────────────────────
function ServerModal({ initial, onClose, onSaved }) {
    const [form, setForm] = useState({
        name: initial?.name || '', path: initial?.path || '',
        port: initial?.port || 25565, jvm_args: initial?.jvm_args || '',
    });
    const [saving, setSaving] = useState(false);
    const isNew = !initial?.id;
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const { data: rec } = useQuery({
        queryKey: ['server-recommendations'],
        queryFn: () => api.get('/servers/recommendations').then(r => r.data),
        enabled: isNew, staleTime: 30000,
    });

    const handleSave = async () => {
        if (!form.name.trim()) return toast.error('Sunucu adı gerekli');
        if (!form.path.trim()) return toast.error('Sunucu yolu gerekli');
        setSaving(true);
        try {
            if (initial?.id) { await api.put(`/servers/${initial.id}`, form); toast.success('Sunucu güncellendi'); }
            else { await api.post('/servers', form); toast.success('Sunucu eklendi'); }
            onSaved();
        } catch (e) { toast.error(e.response?.data?.error || 'Hata'); }
        finally { setSaving(false); }
    };

    return (
        <Modal title={initial?.id ? 'Sunucuyu Düzenle' : 'Yeni Sunucu Ekle'} onClose={onClose}>
            {isNew && <RecommendationPanel rec={rec} />}
            <ModalField label="Sunucu Adı"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Örn: Survival Sunucu" /></ModalField>
            <ModalField label="Sunucu Yolu" hint="server.jar dosyasının bulunduğu tam yol (ör. /home/mc/server)">
                <Input mono value={form.path} onChange={e => set('path', e.target.value)} placeholder="/home/minecraft/server" />
            </ModalField>
            <ModalField label={`Port${rec && isNew ? `  ·  öneri: ${rec.suggestedPort}` : ''}`}>
                <Input type="number" mono value={form.port} onChange={e => set('port', parseInt(e.target.value))} />
            </ModalField>
            <ModalField label="JVM Argümanları (isteğe bağlı)" hint="RAM için: -Xmx4G -Xms2G (4GB maks, 2GB min)">
                <Input mono value={form.jvm_args} onChange={e => set('jvm_args', e.target.value)} placeholder="-Xmx4G -Xms2G -XX:+UseG1GC" />
            </ModalField>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button onClick={onClose} style={btnGhost}>İptal</button>
                <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
                    <I.Check size={13} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>
        </Modal>
    );
}

// ── Ana sayfa ────────────────────────────────────────────────────────────────
export default function ServersPage() {
    const qc = useQueryClient();
    const [modal, setModal] = useState(null); // null | 'add' | server object

    const { data, isLoading } = useQuery({ queryKey: ['servers'], queryFn: () => api.get('/servers').then(r => r.data) });

    const activateMutation = useMutation({
        mutationFn: (id) => api.post(`/servers/${id}/activate`),
        onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries({ queryKey: ['servers'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Geçiş yapılamadı'),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/servers/${id}`),
        onSuccess: () => { toast.success('Sunucu silindi'); qc.invalidateQueries({ queryKey: ['servers'] }); },
        onError: (e) => toast.error(e.response?.data?.error || 'Silinemedi'),
    });

    const servers = data?.servers || [];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: A.sans, color: A.text }}>
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>Çoklu Sunucu Yönetimi</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <I.Server size={20} style={{ color: 'var(--accent)' }} /> Sunucular
                    </h1>
                </div>
                <button onClick={() => setModal('add')} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <I.Plus size={13} /> Yeni Sunucu
                </button>
            </div>

            {isLoading ? (
                <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Yükleniyor…</div>
            ) : servers.length === 0 ? (
                <Card>
                    <div style={{ textAlign: 'center', padding: '36px 0', color: A.faint }}>
                        <I.Server size={32} style={{ opacity: 0.4, marginBottom: 10 }} />
                        <div style={{ fontSize: 13, color: A.dim, fontWeight: 600 }}>Henüz sunucu yok</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>"Yeni Sunucu" ile ekle.</div>
                    </div>
                </Card>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {servers.map(server => (
                        <div key={server.id} style={{
                            background: A.panel, borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
                            border: `1px solid ${server.is_active ? 'var(--accent)' : A.border}`,
                            boxShadow: server.is_active ? '0 0 0 1px var(--accent)' : 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center', background: server.is_active ? 'rgba(167,139,250,0.18)' : A.bg }}>
                                        <I.Server size={16} style={{ color: server.is_active ? 'var(--accent)' : A.faint }} />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</div>
                                        {server.is_active && <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: A.mono }}>● Birincil</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                    <button onClick={() => setModal(server)} style={{ ...btnGhost, padding: '5px 7px' }} title="Düzenle"><I.Wrench size={13} /></button>
                                    {!server.is_active && (
                                        <button onClick={() => window.confirm(`"${server.name}" silinsin mi?`) && deleteMutation.mutate(server.id)}
                                            style={{ ...btnGhost, color: A.err, padding: '5px 7px' }} title="Sil"><I.Trash size={13} /></button>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={server.path}>{server.path}</span>
                                <span>Port: <span style={{ color: A.dim }}>{server.port}</span>{server.maxRamGB ? <> · RAM: <span style={{ color: A.dim }}>{server.maxRamGB} GB</span></> : null}</span>
                                <span>Screen: knozy-mc{server.id}</span>
                            </div>

                            {!server.is_active && (
                                <button onClick={() => activateMutation.mutate(server.id)} disabled={activateMutation.isPending}
                                    style={{ ...btnGhost, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: activateMutation.isPending ? 0.5 : 1 }}>
                                    <I.Check size={13} /> Birincil Yap
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {modal && (
                <ServerModal initial={modal === 'add' ? null : modal} onClose={() => setModal(null)}
                    onSaved={() => { qc.invalidateQueries({ queryKey: ['servers'] }); setModal(null); }} />
            )}
        </div>
    );
}
