// client/src/components/Dashboard/widgets/UptimeKpi.jsx
import { KPI } from '@/hodo/primitives';

const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function fmtUptime(sec) {
    if (!sec || sec < 1) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtSince(startedAt) {
    if (!startedAt) return '—';
    const d = new Date(startedAt);
    return `since ${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function UptimeKpi({ server }) {
    const uptime = server?.uptimeSec || 0;
    const startedAt = server?.startedAt;
    return (
        <KPI label="ÇALIŞMA SÜRESİ"
            value={fmtUptime(uptime)}
            sub={fmtSince(startedAt)}/>
    );
}
