// client/src/components/Dashboard/widgets/ResourceChart.jsx
import { A } from '@/hodo/tokens';
import { Card, Stat, LegendDot } from '@/hodo/primitives';
import { DualLine, avg, max } from '@/hodo/charts';

export function ResourceChart({ series }) {
    const cpuVals = (series || []).map(s => s.cpu);
    const ramVals = (series || []).map(s => s.ram);
    return (
        <Card title="Kaynaklar (60s · canlı)" accent="var(--accent)"
            style={{ height: '100%' }}
            action={
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <LegendDot color="var(--accent)" label="CPU"/>
                    <LegendDot color={A.ok} label="RAM" dashed/>
                </div>
            }>
            <DualLine a={cpuVals} b={ramVals} width={780} height={110}
                strokeA="var(--accent)" strokeB={A.ok}/>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${A.border}`,
            }}>
                <Stat label="CPU avg" value={`${avg(cpuVals).toFixed(1)}%`}/>
                <Stat label="CPU peak" value={`${max(cpuVals).toFixed(1)}%`}/>
                <Stat label="RAM avg" value={`${avg(ramVals).toFixed(1)}%`}/>
                <Stat label="RAM peak" value={`${max(ramVals).toFixed(1)}%`}/>
            </div>
        </Card>
    );
}
