import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/knozy/tokens';
import { Cap, Pill, Card, Num } from '@/knozy/primitives';
import { AreaChart } from '@/knozy/charts';
import { I } from '@/knozy/icons';

async function fetchPerformance() {
    const { data } = await api.get('/system/performance');
    return data;
}

const barColor = (p) => (p > 85 ? A.err : p > 60 ? A.warn : A.ok);

function ProgressBar({ pct, height = 6 }) {
    return (
        <div style={{ height, background: A.bg, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%`, height: '100%', background: barColor(pct || 0), transition: 'width 0.5s' }} />
        </div>
    );
}

// KPI-benzeri panel (ikon sol, sub sağ, büyük sayı, içerik)
function Panel({ label, icon: Icon, sub, children }) {
    return (
        <div style={{ background: A.panel, border: `1px solid ${A.border}`, borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {Icon && <Icon size={13} style={{ color: A.faint }} />}
                    <Cap>{label}</Cap>
                </div>
                {sub != null && <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>{sub}</span>}
            </div>
            {children}
        </div>
    );
}

function TpsCard({ tps }) {
    const val = tps?.one ?? null;
    const color = val == null ? A.faint : val >= 19 ? A.ok : val >= 15 ? A.warn : A.err;
    const label = val == null ? 'Yalnızca Paper/Spigot' : val >= 19 ? 'Mükemmel' : val >= 15 ? 'Orta' : 'Düşük';
    return (
        <Panel label="TPS" icon={I.Signal}>
            <Num size={24} color={color}>{val != null ? val.toFixed(2) : '—'}</Num>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                <span>1m: <span style={{ color }}>{tps?.one?.toFixed(1) ?? '—'}</span></span>
                <span>5m: <span style={{ color }}>{tps?.five?.toFixed(1) ?? '—'}</span></span>
                <span>15m: <span style={{ color }}>{tps?.fifteen?.toFixed(1) ?? '—'}</span></span>
            </div>
            <div style={{ fontSize: 11, color }}>{label}</div>
        </Panel>
    );
}

function MiniStat({ label, value }) {
    return (
        <div>
            <Cap>{label}</Cap>
            <div style={{ fontSize: 13, fontWeight: 600, color: A.text, marginTop: 2 }}>{value}</div>
        </div>
    );
}

function McStatusCard({ mc }) {
    const map = {
        running:  { label: 'Çalışıyor',  color: A.ok },
        starting: { label: 'Başlıyor',   color: A.warn },
        stopping: { label: 'Kapanıyor',  color: A.warn },
        stopped:  { label: 'Durduruldu', color: A.faint },
    };
    const s = map[mc?.status] || map.stopped;
    return (
        <Panel label="MC Sunucu" icon={I.Server}>
            <Pill color={s.color}>{s.label.toUpperCase()}</Pill>
            <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>
                <MiniStat label="Oyuncu" value={mc?.players ?? 0} />
                <MiniStat label="Java Bellek" value={mc?.javaMem ? `${mc.javaMem} MB` : '—'} />
                <MiniStat label="Java CPU" value={mc?.javaCpu ? `${mc.javaCpu}%` : '—'} />
            </div>
        </Panel>
    );
}

const FOLDER_COLORS = {
    world: '#4ade80', world_nether: '#f87171', world_the_end: '#a78bfa',
    mods: '#fbbf24', config: '#60a5fa', logs: '#94a3b8',
    backups: '#22d3ee', plugins: '#f472b6', 'crash-reports': '#fb923c', diğer: '#94a3b8',
};

function DiskAnalysisPanel() {
    const { data, isLoading } = useQuery({
        queryKey: ['disk-analysis'],
        queryFn: () => api.get('/worlds/disk').then(r => r.data),
        refetchInterval: 60000,
    });

    if (isLoading) return <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Yükleniyor…</div>;
    if (!data) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.sysDisk && (
                <Card title="Sistem Diski" action={<span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>{data.sysDisk.usedGB} / {data.sysDisk.totalGB} GB</span>}>
                    <ProgressBar pct={data.sysDisk.percent} height={8} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                        <span>Kullanılan: {data.sysDisk.percent?.toFixed(1)}%</span>
                        <span>Boş: {(data.sysDisk.totalGB - data.sysDisk.usedGB).toFixed(1)} GB</span>
                    </div>
                </Card>
            )}

            <Card title="Sunucu Klasörleri" action={<span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>Toplam: {data.totalFormatted}</span>}>
                {data.folders.length > 0 && (
                    <div style={{ display: 'flex', height: 16, width: '100%', borderRadius: 8, overflow: 'hidden', marginBottom: 14, gap: 1 }}>
                        {data.folders.map(f => (
                            <div key={f.name} title={`${f.name}: ${f.formatted}`}
                                style={{ width: `${f.percent}%`, background: FOLDER_COLORS[f.name] || '#94a3b8', minWidth: f.percent > 1 ? 2 : 0, transition: 'width 0.5s' }} />
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.folders.map(f => (
                        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: FOLDER_COLORS[f.name] || '#94a3b8' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                <I.Folder size={13} style={{ color: A.faint, flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: A.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{f.formatted}</span>
                            <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, width: 44, textAlign: 'right' }}>{f.percent}%</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

export default function PerformancePage() {
    const { data, isLoading } = useQuery({
        queryKey: ['performance'],
        queryFn: fetchPerformance,
        refetchInterval: 3000,
        refetchIntervalInBackground: true,
    });

    const [tab, setTab] = useState('live');
    const cpuHistory = data?.history?.map(h => h.cpu) ?? [];
    const ramHistory = data?.history?.map(h => h.ram) ?? [];

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: A.sans, color: A.text }}>
            {/* Başlık */}
            <div>
                <Cap>Gerçek Zamanlı Sistem Kaynakları</Cap>
                <h1 style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <I.CPU size={20} style={{ color: 'var(--accent)' }} /> Performans Monitörü
                </h1>
            </div>

            {/* Sekmeler */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${A.border}`, gap: 4 }}>
                {[{ id: 'live', label: 'Canlı', icon: I.Signal }, { id: 'disk', label: 'Disk Analizi', icon: I.Disk }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        background: 'transparent', border: 'none',
                        borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                        color: tab === t.id ? '#fff' : A.dim, fontSize: 12, fontWeight: 500,
                        padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <t.icon size={14} style={{ color: tab === t.id ? 'var(--accent)' : A.faint }} /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'disk' && <DiskAnalysisPanel />}

            {tab === 'live' && (isLoading ? (
                <div style={{ color: A.faint, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Yükleniyor…</div>
            ) : (
                <>
                    {/* Üst KPI'lar */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        <Panel label="CPU Kullanımı" icon={I.CPU}>
                            <Num size={24} color={barColor(data?.cpu || 0)}>{data?.cpu != null ? `${data.cpu.toFixed(1)}%` : '—'}</Num>
                            <ProgressBar pct={data?.cpu} />
                            {cpuHistory.length > 1 && <div style={{ marginTop: 2 }}><AreaChart values={cpuHistory} min={0} max={100} stroke="var(--accent)" fill="rgba(167,139,250,0.12)" height={34} /></div>}
                        </Panel>

                        <Panel label="RAM Kullanımı" icon={I.RAM} sub={data?.ram ? `${data.ram.usedMB} / ${data.ram.totalMB} MB` : null}>
                            <Num size={24} color={barColor(data?.ram?.percent || 0)}>{data?.ram?.percent != null ? `${data.ram.percent.toFixed(1)}%` : '—'}</Num>
                            <ProgressBar pct={data?.ram?.percent} />
                            {ramHistory.length > 1 && <div style={{ marginTop: 2 }}><AreaChart values={ramHistory} min={0} max={100} stroke="#4ade80" fill="rgba(74,222,128,0.12)" height={34} /></div>}
                        </Panel>

                        <TpsCard tps={data?.mc?.tps} />
                        <McStatusCard mc={data?.mc} />
                    </div>

                    {/* Disk kullanımı */}
                    {data?.disk && (
                        <Card title="Disk Kullanımı"
                            action={<Num size={18} color={barColor(data.disk.percent)}>{data.disk.percent?.toFixed(1)}%</Num>}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: A.faint, fontFamily: A.mono, marginBottom: 6 }}>
                                <span>{data.disk.usedGB} GB kullanılıyor</span>
                                <span>{data.disk.totalGB} GB toplam</span>
                            </div>
                            <ProgressBar pct={data.disk.percent} height={8} />
                        </Card>
                    )}

                    {/* Geçmiş grafikleri */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                        <Card title="CPU Geçmişi" action={<span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>son 3 dakika</span>}>
                            {cpuHistory.length > 1
                                ? <AreaChart values={cpuHistory} min={0} max={100} stroke="var(--accent)" fill="rgba(167,139,250,0.12)" height={90} />
                                : <div style={{ color: A.faint, fontSize: 12, padding: '30px 0', textAlign: 'center' }}>Veri bekleniyor…</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                <span>3dk önce</span><span>şimdi</span>
                            </div>
                        </Card>
                        <Card title="RAM Geçmişi" action={<span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>son 3 dakika</span>}>
                            {ramHistory.length > 1
                                ? <AreaChart values={ramHistory} min={0} max={100} stroke="#4ade80" fill="rgba(74,222,128,0.12)" height={90} />
                                : <div style={{ color: A.faint, fontSize: 12, padding: '30px 0', textAlign: 'center' }}>Veri bekleniyor…</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: A.faint, fontFamily: A.mono }}>
                                <span>3dk önce</span><span>şimdi</span>
                            </div>
                        </Card>
                    </div>
                </>
            ))}
        </div>
    );
}
