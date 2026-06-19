// client/src/components/Dashboard/WidgetGrid.jsx
// Sabit düzen — drag/drop yok, edit modu yok.
// Layout DEFAULT_LAYOUT'tan gelir; desktop'ta CSS grid, mobil'de flex column.
import { WIDGET_MAP } from './widgetMap';

const COLS = 12;
const ROW_HEIGHT = 80; // px
const GAP = 12;        // px

export function WidgetGrid({ server, series, installedModpacks, layout }) {
    const widgetProps = { server, series, installedModpacks };
    const totalRows = layout.reduce((max, it) => Math.max(max, it.y + it.h), 0);

    return (
        <>
            <style>{`
                .knozy-widget-grid {
                    display: grid;
                    grid-template-columns: repeat(${COLS}, minmax(0, 1fr));
                    grid-auto-rows: ${ROW_HEIGHT}px;
                    gap: ${GAP}px;
                    grid-template-rows: repeat(${totalRows}, ${ROW_HEIGHT}px);
                }
                .knozy-widget-item {
                    min-width: 0;
                    min-height: 0;
                }
                @media (max-width: 768px) {
                    .knozy-widget-grid {
                        display: flex;
                        flex-direction: column;
                        grid-template-rows: none;
                    }
                    .knozy-widget-item {
                        min-height: 140px;
                        height: auto !important;
                    }
                }
            `}</style>
            <div className="knozy-widget-grid">
                {layout.map(item => {
                    const Widget = WIDGET_MAP[item.i];
                    if (!Widget) return null;
                    return (
                        <div
                            key={item.i}
                            className="knozy-widget-item"
                            style={{
                                gridColumnStart: item.x + 1,
                                gridColumnEnd:   item.x + 1 + item.w,
                                gridRowStart:    item.y + 1,
                                gridRowEnd:      item.y + 1 + item.h,
                            }}
                        >
                            <div style={{ width: '100%', height: '100%' }}>
                                <Widget {...widgetProps}/>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
