// client/src/components/Dashboard/widgets/StatusKpi.jsx
import { KPI } from '@/hodo/primitives';

export function StatusKpi({ server }) {
    return (
        <KPI label="STATUS"
            value={(server?.status || '—').toUpperCase()}
            sub={server?.port ? `port ${server.port}` : '—'}/>
    );
}
