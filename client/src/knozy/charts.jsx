// Inline SVG grafikleri — bağımlılık yok
import { A } from './tokens';

function buildPath(values, w, h, pad = 2, min = 0, max = 100) {
    if (!values?.length) return '';
    const n = values.length;
    const stepX = (w - pad * 2) / Math.max(1, n - 1);
    const range = Math.max(0.0001, max - min);
    return values.map((v, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
}

// Sparkline (sadece çizgi)
export function Sparkline({
    values, width = 80, height = 22, stroke = 'currentColor',
    strokeWidth = 1.25, min = 0, max = 100,
}) {
    const d = buildPath(values, width, height, 1.5, min, max);
    return (
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

// Area chart with thin baseline grid
export function AreaChart({
    values, width = 600, height = 160, stroke = '#a78bfa',
    fill = 'rgba(167,139,250,0.12)', min = 0, max = 100, gridY = 4,
    gridColor = 'rgba(255,255,255,0.05)', label,
}) {
    const d = buildPath(values, width, height, 0, min, max);
    const areaD = d ? `${d} L${width},${height} L0,${height} Z` : '';
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none" style={{ display: 'block' }}>
            {Array.from({ length: gridY + 1 }, (_, i) => {
                const y = (height / gridY) * i;
                return <line key={i} x1="0" x2={width} y1={y} y2={y} stroke={gridColor} strokeWidth="1"/>;
            })}
            <path d={areaD} fill={fill}/>
            <path d={d} fill="none" stroke={stroke} strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round"/>
            {label && (
                <text x="6" y="14" fontSize="10" fill="rgba(255,255,255,0.4)"
                    fontFamily="ui-monospace, JetBrains Mono, monospace">{label}</text>
            )}
        </svg>
    );
}

// Dual line (CPU + RAM)
export function DualLine({
    a, b, width = 600, height = 160, strokeA = '#a78bfa', strokeB = '#4ade80',
    min = 0, max = 100, gridY = 4, gridColor = 'rgba(255,255,255,0.05)',
}) {
    const da = buildPath(a, width, height, 0, min, max);
    const db = buildPath(b, width, height, 0, min, max);
    const areaA = da ? `${da} L${width},${height} L0,${height} Z` : '';
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none" style={{ display: 'block' }}>
            {Array.from({ length: gridY + 1 }, (_, i) => {
                const y = (height / gridY) * i;
                return <line key={i} x1="0" x2={width} y1={y} y2={y}
                    stroke={gridColor} strokeWidth="1"/>;
            })}
            <path d={areaA} fill={`${strokeA}1f`}/>
            <path d={da} fill="none" stroke={strokeA} strokeWidth="1.5"/>
            <path d={db} fill="none" stroke={strokeB} strokeWidth="1.5" strokeDasharray="3 3"/>
        </svg>
    );
}

// Bar mini histogram
export function BarRow({ values, width = 200, height = 28, color = '#a78bfa', max }) {
    const m = max ?? Math.max(...values, 1);
    const bw = width / values.length;
    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            {values.map((v, i) => {
                const h = (v / m) * (height - 2);
                return (
                    <rect key={i} x={i * bw + 0.5} y={height - h}
                        width={bw - 1} height={h} fill={color}
                        opacity={0.55 + (v / m) * 0.45}/>
                );
            })}
        </svg>
    );
}

// Circular gauge
export function Gauge({
    value, size = 64, stroke = 5, color, track = 'rgba(255,255,255,0.06)',
    label, sub, valueColor, fmt,
}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(100, value));
    const off = c - (v / 100) * c;
    const dyn = color || (v > 80 ? A.err : v > 60 ? A.warn : 'var(--accent)');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={size/2} cy={size/2} r={r} stroke={track} strokeWidth={stroke} fill="none"/>
                    <circle cx={size/2} cy={size/2} r={r} stroke={dyn} strokeWidth={stroke} fill="none"
                        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 600ms ease-out, stroke 400ms' }}/>
                </svg>
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', lineHeight: 1,
                }}>
                    <span style={{
                        fontFamily: A.mono, fontSize: size > 80 ? 18 : 13,
                        fontWeight: 600, color: valueColor || A.text,
                        letterSpacing: '-0.02em',
                    }}>{fmt ? fmt(v) : `${v.toFixed(0)}%`}</span>
                </div>
            </div>
            {label && (
                <span style={{
                    fontSize: 10, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: A.dim,
                }}>{label}</span>
            )}
            {sub && (
                <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>{sub}</span>
            )}
        </div>
    );
}

// Yatay kullanım barı
export function UsageBar({ value, color = 'var(--accent)', height = 4, bg = 'rgba(255,255,255,0.06)' }) {
    return (
        <div style={{ background: bg, height, borderRadius: 0, overflow: 'hidden', width: '100%' }}>
            <div style={{
                background: color, height: '100%',
                width: `${Math.max(0, Math.min(100, value))}%`,
                transition: 'width 600ms ease-out',
            }}/>
        </div>
    );
}

// Yardımcı istatistik
export const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
export const max = (arr) => arr.length ? Math.max(...arr) : 0;
