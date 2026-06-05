import { A } from './tokens';
import { Sparkline } from './charts';

// ── Tipografi & küçük süs primitifleri ──────────────────────────────────

export const Cap = ({ children, style }) => (
    <span style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: A.faint, fontWeight: 500, ...style,
    }}>{children}</span>
);

export const Num = ({ children, size = 18, color, style }) => (
    <span style={{
        fontFamily: A.mono, fontSize: size, color: color || A.text,
        fontWeight: 500, letterSpacing: '-0.02em', ...style,
    }}>{children}</span>
);

export const Dot = ({ color, size = 6 }) => (
    <span style={{
        display: 'inline-block', width: size, height: size,
        borderRadius: 99, background: color, flex: 'none',
    }}/>
);

export const Pill = ({ children, color = A.dim, bg = 'rgba(255,255,255,0.04)', style }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10, padding: '2px 7px', borderRadius: 2,
        background: bg, color, fontFamily: A.mono, letterSpacing: '0.04em',
        ...style,
    }}>{children}</span>
);

// ── Card (panel) ────────────────────────────────────────────────────────

// `fill`: kart kendi yüksekliğini doldurur ve gövde taşması kart içinde kalır
// (bodyStyle ile overflowY:'auto' verilerek iç kaydırma sağlanır). Opt-in —
// fill verilmeyen kartlar eskisi gibi blok akışında, davranış değişmez.
export function Card({ title, action, children, style, padding = 16, accent, fill, bodyStyle }) {
    return (
        <div style={{
            background: A.panel, border: `1px solid ${A.border}`,
            borderRadius: 4,
            ...(fill ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' } : null),
            ...style,
        }}>
            {title && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: `1px solid ${A.border}`, gap: 12,
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {accent && <Dot color={accent} size={6} />}
                        <Cap>{title}</Cap>
                    </div>
                    {action}
                </div>
            )}
            <div style={{
                padding,
                ...(fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
                ...bodyStyle,
            }}>{children}</div>
        </div>
    );
}

// ── Anahtar/Değer satırı ────────────────────────────────────────────────

export function KV({ label, value, mono, valueColor, copy, onCopy }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Cap>{label}</Cap>
            <span style={{
                fontFamily: mono ? A.mono : A.sans, fontSize: 12,
                color: valueColor || A.text, cursor: copy ? 'pointer' : 'default',
            }} onClick={copy ? onCopy : undefined}>{value}</span>
        </div>
    );
}

// ── Stat ────────────────────────────────────────────────────────────────

export function Stat({ label, value }) {
    return (
        <div>
            <div style={{ fontFamily: A.mono, fontSize: 14, color: A.text, fontWeight: 500 }}>{value}</div>
            <Cap style={{ marginTop: 4, display: 'block' }}>{label}</Cap>
        </div>
    );
}

export function MiniStat({ label, value }) {
    return (
        <div style={{
            background: A.bg, border: `1px solid ${A.border}`,
            padding: '6px 8px', borderRadius: 2,
        }}>
            <Cap>{label}</Cap>
            <div style={{ fontFamily: A.mono, fontSize: 12, color: A.text, marginTop: 2 }}>{value}</div>
        </div>
    );
}

// ── KPI (Sparkline'lı sayı kartı) ───────────────────────────────────────

export function KPI({
    label, value, unit, sub, spark, sparkMin = 0, sparkMax = 100,
    sparkColor = 'var(--accent)',
}) {
    return (
        <div style={{
            background: A.panel, border: `1px solid ${A.border}`,
            padding: '12px 14px', borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            <Cap>{label}</Cap>
            <div style={{
                display: 'flex', alignItems: 'baseline', gap: 4,
                fontFamily: A.mono, fontWeight: 500,
            }}>
                <span style={{ fontSize: 22, color: A.text, letterSpacing: '-0.02em' }}>{value}</span>
                {unit && <span style={{ fontSize: 11, color: A.faint }}>{unit}</span>}
            </div>
            {sub && <span style={{ fontSize: 10, color: A.faint, fontFamily: A.mono }}>{sub}</span>}
            {spark && spark.length > 0 && (
                <div style={{ marginTop: 'auto' }}>
                    <Sparkline values={spark} width={130} height={22}
                        stroke={sparkColor} min={sparkMin} max={sparkMax}/>
                </div>
            )}
        </div>
    );
}

// ── Sunucu durumu pill'i ───────────────────────────────────────────────

export function ServerStatus({ status, label }) {
    const colors = {
        running:  { fg: A.ok,    bg: 'rgba(74,222,128,0.10)' },
        stopped:  { fg: A.faint, bg: 'rgba(255,255,255,0.04)' },
        starting: { fg: A.warn,  bg: 'rgba(251,191,36,0.10)' },
        stopping: { fg: A.warn,  bg: 'rgba(251,191,36,0.10)' },
        crashed:  { fg: A.err,   bg: 'rgba(248,113,113,0.10)' },
    }[status] || { fg: A.faint, bg: 'rgba(255,255,255,0.04)' };
    const labels = {
        running: 'RUNNING', stopped: 'STOPPED', starting: 'STARTING',
        stopping: 'STOPPING', crashed: 'CRASHED',
    };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px', borderRadius: 2,
            background: colors.bg, color: colors.fg, fontSize: 11,
            fontFamily: A.mono, letterSpacing: '0.06em',
        }}>
            <Dot color={colors.fg} size={6}/>
            {label || labels[status] || status.toUpperCase()}
        </span>
    );
}

// ── Legend dot ─────────────────────────────────────────────────────────

export function LegendDot({ color, label, dashed }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: A.dim, fontFamily: A.mono,
            letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
            <span style={{
                width: 16, height: 1.5, background: dashed ? 'transparent' : color,
                borderTop: dashed ? `1.5px dashed ${color}` : 'none',
            }}/>
            {label}
        </span>
    );
}

// ── Sidebar Nav Item ───────────────────────────────────────────────────

export function NavItem({ icon: Icon, label, active, onClick, badge, collapsed }) {
    return (
        <button onClick={onClick} className="hoodoo-navitem"
            style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: collapsed ? '9px 0' : '8px 12px',
                width: '100%',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? 'rgba(167,139,250,0.08)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: active ? '#fff' : A.dim,
                borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                fontSize: 12.5, fontWeight: 500, textAlign: 'left',
                transition: 'background 120ms, color 120ms',
                fontFamily: A.sans,
            }}>
            {Icon && <Icon size={15} style={{ color: active ? 'var(--accent)' : A.dim, flex: 'none' }}/>}
            {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
            {!collapsed && badge && <Pill style={{ padding: '1px 5px' }}>{badge}</Pill>}
        </button>
    );
}

// ── Form primitifleri ──────────────────────────────────────────────────

export function Input({ value, defaultValue, onChange, placeholder, mono, type = 'text', style }) {
    return (
        <input
            type={type}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
            style={{
                background: A.bg, border: `1px solid ${A.border}`,
                color: A.text, fontFamily: mono ? A.mono : A.sans,
                fontSize: 12, padding: '7px 10px', borderRadius: 2,
                width: '100%', outline: 'none',
                ...style,
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.target.style.borderColor = A.border}
        />
    );
}

export function Toggle({ value, onChange }) {
    return (
        <button onClick={() => onChange?.(!value)}
            style={{
                width: 30, height: 16, borderRadius: 9, border: 'none',
                padding: 0, cursor: 'pointer', position: 'relative',
                background: value ? 'var(--accent)' : A.borderHi,
                transition: 'background 200ms',
            }}>
            <span style={{
                position: 'absolute', top: 2, left: value ? 16 : 2,
                width: 12, height: 12, borderRadius: 99,
                background: value ? '#0a0b0d' : A.dim,
                transition: 'left 200ms',
            }}/>
        </button>
    );
}

// ── TickStat (topbar live ticker için) ─────────────────────────────────

export function TickStat({ label, value, ok }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Cap style={{ fontSize: 9 }}>{label}</Cap>
            <span style={{
                fontFamily: A.mono, fontSize: 11, fontWeight: 500,
                color: ok ? A.text : A.warn, letterSpacing: '-0.01em',
            }}>{value}</span>
        </span>
    );
}
