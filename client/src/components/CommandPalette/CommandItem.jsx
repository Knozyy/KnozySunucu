// client/src/components/CommandPalette/CommandItem.jsx
import { I } from '@/hodo/icons';
import { A } from '@/hodo/tokens';
import { Cap } from '@/hodo/primitives';

export function CommandItem({ item, selected, onSelect, onMouseEnter }) {
    const Icon = I[item.icon];

    return (
        <div
            onMouseEnter={onMouseEnter}
            onClick={onSelect}
            style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 14px', cursor: 'pointer',
                background: selected ? 'rgba(167,139,250,0.10)' : 'transparent',
                borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
            }}
        >
            {/* İkon kutusu */}
            <div style={{
                width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: selected ? 'rgba(167,139,250,0.15)' : A.bgDeeper,
                border: `1px solid ${selected ? 'rgba(167,139,250,0.25)' : A.border}`,
                color: selected ? 'var(--accent)' : A.faint,
            }}>
                {Icon ? <Icon size={13} /> : (
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="13 6 19 12 13 18"/>
                    </svg>
                )}
            </div>

            {/* Metin */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: selected ? A.text : A.dim, fontWeight: 500 }}>
                    {item.label}
                </div>
                {item.description && (
                    <div style={{
                        fontSize: 11, color: A.faint, marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {item.description}
                    </div>
                )}
            </div>

            {/* Kategori etiketi */}
            {item.category && <Cap style={{ flexShrink: 0 }}>{item.category}</Cap>}
        </div>
    );
}
