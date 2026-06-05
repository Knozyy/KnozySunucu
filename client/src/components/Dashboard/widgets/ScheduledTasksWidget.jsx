// client/src/components/Dashboard/widgets/ScheduledTasksWidget.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/hoodoo/tokens';
import { Card } from '@/hoodoo/primitives';

const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function fmtNextRun(nextRunMs) {
    if (!nextRunMs) return '—';
    const ts = Number(nextRunMs);
    if (!Number.isFinite(ts)) return '—';
    const diffMin = Math.round((ts - Date.now()) / 60000);
    if (diffMin >= 0 && diffMin < 60) return `in ${diffMin} min`;
    if (diffMin >= 60 && diffMin < 1440) return `in ${Math.round(diffMin / 60)}h`;
    const d = new Date(ts);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtPattern(task) {
    if (task.cron_expression) return task.cron_expression;
    if (task.interval_minutes) {
        const m = task.interval_minutes;
        if (m % 1440 === 0) return `@daily`;
        if (m % 60 === 0)   return `@hourly`;
        return `every ${m}m`;
    }
    return '—';
}

export function ScheduledTasksWidget({ server }) {
    const { data } = useQuery({
        queryKey: ['scheduler', server?.id],
        queryFn: () => api.get(`/scheduler?serverId=${server?.id || ''}`).then(r => r.data),
        refetchInterval: 30000,
        enabled: !!server?.id,
    });

    const tasks = (data?.tasks || [])
        .filter(t => t.enabled)
        .sort((a, b) => (Number(a.next_run || 0)) - (Number(b.next_run || 0)))
        .slice(0, 6);

    return (
        <Card title="sıradaki" accent={A.warn} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tasks.length === 0 ? (
                    <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                        Aktif zamanlanmış görev yok
                    </div>
                ) : tasks.map((t, i) => (
                    <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, padding: '10px 0',
                        borderBottom: i !== tasks.length - 1 ? `1px solid ${A.border}` : 'none',
                    }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                                fontSize: 12.5, color: A.text, fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{t.name}</div>
                            <div style={{
                                fontSize: 10.5, color: A.faint, fontFamily: A.mono, marginTop: 2,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{fmtPattern(t)}</div>
                        </div>
                        <div style={{
                            fontSize: 11.5, fontFamily: A.mono, color: A.dim,
                            flexShrink: 0,
                        }}>{fmtNextRun(t.next_run)}</div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
