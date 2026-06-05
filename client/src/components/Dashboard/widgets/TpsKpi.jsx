// client/src/components/Dashboard/widgets/TpsKpi.jsx
import { useState, useEffect } from 'react';
import { KPI } from '@/hoodoo/primitives';
import { A } from '@/hoodoo/tokens';

export function TpsKpi({ server }) {
    const tps = server?.tps ?? null;
    const [hist, setHist] = useState(() => Array(60).fill(20));

    useEffect(() => {
        if (tps == null) return;
        setHist(prev => [...prev.slice(1), tps]);
    }, [tps]);

    // TPS rengi: 19+ yeşil, 15-19 sarı, <15 kırmızı
    const color = tps == null ? A.faint : tps >= 19 ? A.ok : tps >= 15 ? A.warn : A.err;

    return (
        <KPI label="TPS"
            value={tps != null ? tps.toFixed(2) : '—'}
            unit="/20"
            spark={hist}
            sparkMin={10}
            sparkMax={20}
            sparkColor={color}/>
    );
}
