// client/src/components/Dashboard/WidgetGrid.jsx
import ReactGridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WIDGET_MAP } from './widgetMap';
import { WidgetWrapper } from './WidgetWrapper';

const ResponsiveGrid = WidthProvider(ReactGridLayout);

export function WidgetGrid({ server, series, installedModpacks, layout, editMode, onLayoutChange, onDeleteWidget }) {
    const widgetProps = { server, series, installedModpacks };

    return (
        <>
            <style>{`
                .react-resizable-handle { opacity: ${editMode ? 1 : 0}; }
                .react-grid-item.react-grid-placeholder { background: rgba(167,139,250,0.15) !important; border-radius: 4px; }
            `}</style>
            <ResponsiveGrid
                layout={layout}
                cols={12}
                rowHeight={80}
                margin={[12, 12]}
                isDraggable={editMode}
                isResizable={editMode}
                draggableHandle=".drag-handle"
                onLayoutChange={onLayoutChange}
                style={{ minHeight: 100 }}
            >
                {layout.map(item => {
                    const Widget = WIDGET_MAP[item.i];
                    if (!Widget) return <div key={item.i}/>;
                    return (
                        <div key={item.i}>
                            <WidgetWrapper
                                widgetId={item.i}
                                editMode={editMode}
                                onDelete={onDeleteWidget}
                            >
                                <Widget {...widgetProps}/>
                            </WidgetWrapper>
                        </div>
                    );
                })}
            </ResponsiveGrid>
        </>
    );
}
