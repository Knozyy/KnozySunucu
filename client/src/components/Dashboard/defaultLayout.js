// client/src/components/Dashboard/defaultLayout.js

// 12 kolonluk grid, rowHeight=80px, margin=[12,12]
export const DEFAULT_LAYOUT = [
    { i: 'cpu-kpi',          x: 0,  y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'ram-kpi',          x: 2,  y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'players-kpi',      x: 4,  y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'status-kpi',       x: 6,  y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'uptime-kpi',       x: 8,  y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'profile-kpi',      x: 10, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
    { i: 'resource-chart',   x: 0,  y: 2, w: 8, h: 4, minW: 4, minH: 3 },
    { i: 'server-info',      x: 8,  y: 2, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'online-players',   x: 0,  y: 6, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'active-profile',   x: 4,  y: 6, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'quick-actions',    x: 8,  y: 6, w: 4, h: 3, minW: 3, minH: 2 },
];
