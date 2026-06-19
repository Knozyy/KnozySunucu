// client/src/components/Dashboard/widgets/ResourceChart.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/knozy/tokens';
import { Card, Cap, LegendDot } from '@/knozy/primitives';
import { DualLine, avg, max } from '@/knozy/charts';

function fmtMbps(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec < 0) return '0 Mb/s';
    const mb = (bytesPerSec * 8) / 1_000_000;
    return `${mb.toFixed(1)} Mb/s`;
}

function FootStat({ label, value }) {
    return (
        <div>
            <div style={{ fontFamily: A.mono, fontSize: 16, fontWeight: 600, color: A.text, letterSpacing: '-0.01em' }}>
                {value}
            </div>
            <Cap style={{ marginTop: 4, display: 'block' }}>{label}</Cap>
        </div>
    );
}

export function ResourceChart({ series }) {
    const cpuVals = (series || []).map(s => s.cpu);
    const ramVals = (series || []).map(s => s.ram);

    const { data: usage } = useQuery({
        queryKey: ['system-usage'],
        queryFn: () => api.get('/system/usage').then(r => r.data),
        refetchInterval: 5000,
    });

    const netSec = (usage?.network || [])
        .reduce((acc, n) => acc + (n.rx_sec || 0) + (n.tx_sec || 0), 0);

    return (
        <Card title="sistem kaynakları" accent="var(--accent)" style={{ height: '100%' }}
            action={
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <LegendDot color="var(--accent)" label="CPU"/>
                    <LegendDot color={A.ok} label="RAM" dashed/>
                    <span style={{
                        fontSize: 10, color: A.faint, fontFamily: A.mono,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>1H · LİVE</span>
                </div>
            }>
            <div style={{
                background: A.bgDeeper, borderRadius: 2,
                padding: '8px 4px',
            }}>
                <DualLine a={cpuVals} b={ramVals} width={780} height={170}
                    strokeA="var(--accent)" strokeB={A.ok}/>
            </div>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginTop: 14, paddingTop: 14, borderTop: `1px solid ${A.border}`,
            }}>
                <FootStat label="CPU AVG"  value={`${avg(cpuVals).toFixed(1)}%`}/>
                <FootStat label="CPU PEAK" value={`${max(cpuVals).toFixed(1)}%`}/>
                <FootStat label="RAM AVG"  value={`${avg(ramVals).toFixed(1)}%`}/>
                <FootStat label="NET AVG"  value={fmtMbps(netSec)}/>
            </div>
        </Card>
    );
}
