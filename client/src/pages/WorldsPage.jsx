import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Cap, Dot } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

function HashIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9"/>
            <line x1="4" y1="15" x2="20" y2="15"/>
            <line x1="10" y1="3" x2="8" y2="21"/>
            <line x1="16" y1="3" x2="14" y2="21"/>
        </svg>
    );
}

function ClipboardIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="4" rx="1"/>
            <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
        </svg>
    );
}

function Spinner({ size = 16 }) {
    return (
        <div style={{
            width: size, height: size,
            border: `2px solid ${A.border}`,
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'hoodoo-spin 0.8s linear infinite',
        }}/>
    );
}

function WorldCard({ world, onBackup, onReset, backupPending, resetPending }) {
    return (
        <div style={{
            background: A.panel, border: `1px solid ${A.border}`,
            borderRadius: 4, padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 14,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 4, flexShrink: 0,
                    background: 'rgba(74,222,128,0.08)',
                    border: '1px solid rgba(74,222,128,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4ade80',
                }}>
                    <I.World size={18}/>
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>
                        {world.name}
                    </div>
                    <div style={{ fontSize: 11, color: A.faint, fontFamily: A.mono, marginTop: 2 }}>
                        {world.sizeFormatted}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onBackup} disabled={backupPending} style={{
                    ...btnGhost, flex: 1, fontSize: 11, padding: '7px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: backupPending ? 0.5 : 1,
                    cursor: backupPending ? 'not-allowed' : 'pointer',
                }}>
                    <I.Archive size={13}/> Yedekle
                </button>
                <button onClick={onReset} disabled={resetPending} style={{
                    ...btnGhost, fontSize: 11, padding: '7px 14px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: A.err, borderColor: 'rgba(248,113,113,0.2)',
                    opacity: resetPending ? 0.5 : 1,
                    cursor: resetPending ? 'not-allowed' : 'pointer',
                }}>
                    <I.Trash size={13}/> Sıfırla
                </button>
            </div>
        </div>
    );
}

export default function WorldsPage() {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data, isLoading } = useQuery({
        queryKey: ['worlds'],
        queryFn: () => api.get('/worlds').then(r => r.data),
    });

    const resetMutation = useMutation({
        mutationFn: (worldName) => api.post('/worlds/reset', { worldName }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['worlds'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Sıfırlanamadı'),
    });

    const backupMutation = useMutation({
        mutationFn: (worldName) => api.post('/worlds/backup', { worldName }),
        onSuccess: (res) => toast.success(res.data.message),
        onError: (err) => toast.error(err.response?.data?.error || 'Yedeklenemedi'),
    });

    const { data: seedData } = useQuery({
        queryKey: ['world-seed'],
        queryFn: () => api.get('/worlds/seed').then(r => r.data),
    });

    const worlds = data?.worlds || [];
    const totalSize = data?.totalSize;
    const resolvedPath = data?.resolvedPath;

    const hasSeed = seedData?.seed
        && seedData.seed !== '(rastgele)'
        && seedData.seed !== '(bulunamadı)';

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hoodoo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Başlık ── */}
            <div>
                <Cap>dünyalar</Cap>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                    margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                    {t('worlds.title')}
                </h1>
                <p style={{ fontSize: 12, color: A.dim, margin: 0, fontFamily: A.mono }}>
                    {worlds.length} dünya{totalSize ? ` — Toplam ${totalSize.formatted}` : ''}
                </p>
            </div>

            {/* ── Dünya Kartları ── */}
            {isLoading ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 12,
                }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: 16,
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <div style={{ width: 40, height: 40, borderRadius: 4, background: A.border }}/>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ width: 100, height: 12, background: A.border, borderRadius: 2 }}/>
                                <div style={{ width: 60, height: 10, background: A.border, borderRadius: 2 }}/>
                            </div>
                        </div>
                    ))}
                </div>
            ) : worlds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <I.World size={40} style={{ color: A.faint, margin: '0 auto 12px', display: 'block', opacity: 0.3 }}/>
                    <p style={{ fontSize: 13, color: A.faint, margin: '0 0 8px' }}>Dünya bulunamadı</p>
                    {resolvedPath && (
                        <div style={{
                            display: 'inline-block', marginTop: 8,
                            background: A.bgDeeper, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '8px 14px', textAlign: 'left',
                        }}>
                            <p style={{ fontSize: 11, color: A.faint, margin: '0 0 4px', fontFamily: A.mono }}>
                                Taranan yol:
                            </p>
                            <code style={{ fontSize: 12, color: A.warn, fontFamily: A.mono }}>{resolvedPath}/world</code>
                            <p style={{ fontSize: 11, color: A.faintest, margin: '6px 0 0', fontFamily: A.mono }}>
                                Sunucular sayfasından sunucu yolunu kontrol edin.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 12,
                }}>
                    {worlds.map(world => (
                        <WorldCard
                            key={world.name}
                            world={world}
                            onBackup={() => backupMutation.mutate(world.name)}
                            onReset={() => {
                                if (confirm(`${world.name} kalıcı olarak SİLİNECEK. Yeni dünya oluşmak için sunucuyu yeniden başlatmanız gerekecek. Emin misiniz?`))
                                    resetMutation.mutate(world.name);
                            }}
                            backupPending={backupMutation.isPending}
                            resetPending={resetMutation.isPending}
                        />
                    ))}
                </div>
            )}

            {/* ── Seed + Boyut ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {/* Seed kartı */}
                <div style={{
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderRadius: 4, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                        background: 'rgba(167,139,250,0.08)',
                        border: '1px solid rgba(167,139,250,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--accent)',
                    }}>
                        <HashIcon size={16}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Cap style={{ marginBottom: 4 }}>Dünya Seed</Cap>
                        <div style={{
                            fontSize: 14, fontWeight: 600, color: A.text,
                            fontFamily: A.mono, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {seedData?.seed ?? '—'}
                        </div>
                    </div>
                    {hasSeed && (
                        <button
                            onClick={() => { navigator.clipboard.writeText(seedData.seed); toast.success('Seed kopyalandı!'); }}
                            title="Kopyala"
                            style={{
                                ...btnGhost, padding: '4px 6px', color: A.faint,
                                display: 'flex', alignItems: 'center', flexShrink: 0,
                            }}>
                            <ClipboardIcon size={14}/>
                        </button>
                    )}
                </div>

                {/* Toplam boyut kartı */}
                {totalSize && (
                    <div style={{
                        background: A.panel, border: `1px solid ${A.border}`,
                        borderRadius: 4, padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                            background: 'rgba(96,165,250,0.08)',
                            border: '1px solid rgba(96,165,250,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#60a5fa',
                        }}>
                            <I.Disk size={16}/>
                        </div>
                        <div>
                            <Cap style={{ marginBottom: 4 }}>Toplam Dünya Boyutu</Cap>
                            <div style={{ fontSize: 18, fontWeight: 700, color: A.text, fontFamily: A.mono }}>
                                {totalSize.formatted}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
