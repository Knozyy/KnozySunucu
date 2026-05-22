// client/src/components/Dashboard/WidgetGrid.jsx
import { useRef, useState, useEffect } from 'react';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WIDGET_MAP } from './widgetMap';
import { WidgetWrapper } from './WidgetWrapper';

function useContainerWidth(ref) {
    const [width, setWidth] = useState(1200);
    useEffect(() => {
        if (!ref.current) return;
        setWidth(ref.current.getBoundingClientRect().width);
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);
    return width;
}

export function WidgetGrid({ server, series, installedModpacks, layout, editMode, onLayoutChange, onDeleteWidget }) {
    const containerRef = useRef(null);
    const width = useContainerWidth(containerRef);
    const widgetProps = { server, series, installedModpacks };

    return (
        <div ref={containerRef}>
            <style>{`
                .react-resizable-handle { opacity: ${editMode ? 1 : 0}; }
                .react-grid-item.react-grid-placeholder { background: rgba(167,139,250,0.15) !important; border-radius: 4px; }
            `}</style>
            <ReactGridLayout
                width={width}
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
            </ReactGridLayout>
        </div>
    );
}
