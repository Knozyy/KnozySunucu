// client/src/components/Dashboard/WidgetWrapper.jsx
import { A } from '@/hodo/tokens';

function DragHandleIcon() {
    return (
        <svg width={12} height={12} viewBox="0 0 24 24">
            {[7, 12, 17].flatMap(cy => [9, 15].map(cx => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} fill="currentColor"/>
            )))}
        </svg>
    );
}

export function WidgetWrapper({ widgetId, editMode, onDelete, children }) {
    return (
        <div style={{ position: 'relative', height: '100%' }}>
            {editMode && (
                <>
                    {/* Sürükleme tutamacı */}
                    <div className="drag-handle" style={{
                        position: 'absolute', top: 6, left: 6, zIndex: 10,
                        width: 22, height: 22, borderRadius: 3,
                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: A.faint, cursor: 'grab',
                    }}>
                        <DragHandleIcon/>
                    </div>

                    {/* Silme butonu */}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onDelete(widgetId); }}
                        style={{
                            position: 'absolute', top: 6, right: 6, zIndex: 10,
                            width: 22, height: 22, borderRadius: 3, padding: 0,
                            background: 'rgba(248,113,113,0.15)',
                            border: '1px solid rgba(248,113,113,0.3)',
                            color: A.err, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15, fontWeight: 700, lineHeight: 1,
                        }}
                    >×</button>

                    {/* Edit modu border */}
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 5,
                        border: `1px dashed ${A.borderHi}`,
                        borderRadius: 4, pointerEvents: 'none',
                    }}/>
                </>
            )}
            <div style={{ height: '100%', overflow: 'hidden' }}>
                {children}
            </div>
        </div>
    );
}
