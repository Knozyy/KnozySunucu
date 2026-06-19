// client/src/components/Dashboard/widgets/MsptKpi.jsx
import { useState, useEffect } from 'react';
import { KPI } from '@/knozy/primitives';
import { A } from '@/knozy/tokens';

export function MsptKpi({ server }) {
    const mspt = server?.mspt ?? null;
    const [hist, setHist] = useState(() => Array(60).fill(50));

    useEffect(() => {
        if (mspt == null) return;
        setHist(prev => [...prev.slice(1), mspt]);
    }, [mspt]);

    // MSPT rengi: <40 yeşil, 40-50 sarı, >50 kırmızı
    const color = mspt == null ? A.faint : mspt < 40 ? A.ok : mspt <= 50 ? A.warn : A.err;

    return (
        <KPI label="MSPT"
            value={mspt != null ? mspt.toFixed(1) : '—'}
            unit="ms"
            spark={hist}
            sparkMin={0}
            sparkMax={100}
            sparkColor={color}/>
    );
}
