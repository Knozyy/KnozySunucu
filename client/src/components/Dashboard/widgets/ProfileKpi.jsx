// client/src/components/Dashboard/widgets/ProfileKpi.jsx
import { KPI } from '@/hodo/primitives';

export function ProfileKpi({ server, installedModpacks }) {
    const activePack = (installedModpacks || []).find(p => p.id === server?.active_modpack_id);
    return (
        <KPI label="PROFİL"
            value={activePack?.name || '—'}
            sub={activePack?.version ? `v${activePack.version}` : ''}/>
    );
}
