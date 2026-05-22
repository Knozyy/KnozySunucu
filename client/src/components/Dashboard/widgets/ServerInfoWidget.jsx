// client/src/components/Dashboard/widgets/ServerInfoWidget.jsx
import { A } from '@/hodo/tokens';
import { Card, KV } from '@/hodo/primitives';

export function ServerInfoWidget({ server }) {
    return (
        <Card title="Sunucu Bilgisi" accent={A.ok} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <KV label="ad"      value={server?.name || '—'} mono/>
                <KV label="port"    value={server?.port || '—'} mono/>
                <KV label="ram min" value={server?.min_ram || '—'} mono/>
                <KV label="ram max" value={server?.max_ram || '—'} mono/>
                <KV label="path"    value={server?.path || '—'} mono valueColor={A.dim}/>
                <KV label="durum"   value={server?.status || '—'} mono valueColor={
                    server?.status === 'running' ? A.ok :
                    server?.status === 'starting' ? A.warn : A.dim
                }/>
            </div>
        </Card>
    );
}
