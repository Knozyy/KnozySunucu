import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatBytes, formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import { useI18n } from '@/context/I18nContext';
import { A, btnPrimary, btnGhost } from '@/hodo/tokens';
import { Cap } from '@/hodo/primitives';
import { I } from '@/hodo/icons';

function RefreshIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
    );
}

function Spinner({ size = 16 }) {
    return (
        <div style={{
            width: size, height: size,
            border: `2px solid rgba(255,255,255,0.2)`,
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'hodo-spin 0.8s linear infinite',
        }}/>
    );
}

export default function BackupPage() {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const { data, isLoading } = useQuery({
        queryKey: ['backups'],
        queryFn: () => api.get('/backup/list').then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (name) => api.post('/backup/create', { name }),
        onSuccess: () => {
            toast.success('Yedekleme oluşturuldu!');
            queryClient.invalidateQueries({ queryKey: ['backups'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Yedekleme oluşturulamadı'),
    });

    const restoreMutation = useMutation({
        mutationFn: (id) => api.post(`/backup/restore/${id}`),
        onSuccess: () => toast.success('Yedek geri yüklendi! Sunucuyu yeniden başlatın.'),
        onError: (err) => toast.error(err.response?.data?.error || 'Geri yükleme başarısız'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(`/backup/${id}`),
        onSuccess: () => {
            toast.success('Yedek silindi');
            queryClient.invalidateQueries({ queryKey: ['backups'] });
        },
        onError: (err) => toast.error(err.response?.data?.error || 'Silme başarısız'),
    });

    const handleCreate = () => {
        const name = prompt('Yedek adı (boş bırakılabilir):');
        createMutation.mutate(name || undefined);
    };

    const handleRestore = (backup) => {
        if (window.confirm(`"${backup.name}" yedeğini geri yüklemek istediğinize emin misiniz?`))
            restoreMutation.mutate(backup.id);
    };

    const handleDelete = (backup) => {
        if (window.confirm(`"${backup.name}" yedeğini silmek istediğinize emin misiniz?`))
            deleteMutation.mutate(backup.id);
    };

    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: A.sans, color: A.text }}>
            <style>{`@keyframes hodo-spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Başlık ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <Cap>yedekleme</Cap>
                    <h1 style={{ fontSize: 22, fontWeight: 600, color: A.text,
                        margin: '4px 0 2px', letterSpacing: '-0.01em' }}>
                        {t('nav.backup')}
                    </h1>
                    <p style={{ fontSize: 12, color: A.dim, margin: 0 }}>
                        Dünya ve konfigürasyon yedeklerini yönet
                    </p>
                </div>
                <button onClick={handleCreate} disabled={createMutation.isPending} style={{
                    ...btnPrimary, padding: '8px 16px', fontSize: 11, flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: createMutation.isPending ? 0.7 : 1,
                    cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                }}>
                    {createMutation.isPending ? <Spinner size={13}/> : <I.Plus size={13}/>}
                    Yeni Yedek
                </button>
            </div>

            {/* ── İçerik ── */}
            {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '14px 16px',
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <div style={{ width: 36, height: 36, borderRadius: 4, background: A.border }}/>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ width: 160, height: 12, background: A.border, borderRadius: 2 }}/>
                                <div style={{ width: 100, height: 10, background: A.border, borderRadius: 2 }}/>
                            </div>
                        </div>
                    ))}
                </div>
            ) : data?.backups?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.backups.map(backup => (
                        <div key={backup.id} style={{
                            background: A.panel, border: `1px solid ${A.border}`,
                            borderRadius: 4, padding: '14px 16px',
                            display: 'flex', alignItems: 'center', gap: 14,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(167,139,250,0.08)',
                                border: '1px solid rgba(167,139,250,0.15)',
                                color: 'var(--accent)',
                            }}>
                                <I.Archive size={16}/>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: A.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {backup.name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 3 }}>
                                    <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                        {formatBytes(backup.size)}
                                    </span>
                                    <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                                        {formatDate(backup.created_at)}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button onClick={() => handleRestore(backup)} disabled={restoreMutation.isPending} style={{
                                    ...btnGhost, padding: '6px 12px', fontSize: 11,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    opacity: restoreMutation.isPending ? 0.5 : 1,
                                    cursor: restoreMutation.isPending ? 'not-allowed' : 'pointer',
                                }}>
                                    <RefreshIcon size={12}/> Geri Yükle
                                </button>
                                <button onClick={() => handleDelete(backup)} disabled={deleteMutation.isPending} style={{
                                    ...btnGhost, padding: '6px 12px', fontSize: 11,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    color: A.err, borderColor: 'rgba(248,113,113,0.2)',
                                    opacity: deleteMutation.isPending ? 0.5 : 1,
                                    cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                                }}>
                                    <I.Trash size={12}/> Sil
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{
                    background: A.panel, border: `1px solid ${A.border}`,
                    borderRadius: 4, padding: '64px 20px', textAlign: 'center',
                }}>
                    <I.Archive size={40} style={{ color: A.faint, margin: '0 auto 14px', display: 'block', opacity: 0.2 }}/>
                    <p style={{ fontSize: 14, color: A.dim, margin: '0 0 6px' }}>Henüz yedek yok</p>
                    <p style={{ fontSize: 12, color: A.faint, margin: 0 }}>
                        İlk yedeği oluşturmak için yukarıdaki butona tıklayın
                    </p>
                </div>
            )}
        </div>
    );
}
