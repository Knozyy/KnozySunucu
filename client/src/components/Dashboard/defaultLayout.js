// client/src/components/Dashboard/defaultLayout.js
//
// 12 kolonluk grid, rowHeight=80px, margin=[12,12]
//
// Görsel referansa göre düzen:
//   row 0: 6 KPI kartı (her biri w=2, h=2)
//   row 2: sistem kaynakları (w=8, h=5)  |  bağlantı (w=4, h=5)
//   row 7: online (w=4, h=5)             |  profil (w=4, h=5)  |  sıradaki (w=4, h=5)
//
export const DEFAULT_LAYOUT = [
    { i: 'cpu-kpi',         x: 0,  y: 0, w: 2, h: 2 },
    { i: 'ram-kpi',         x: 2,  y: 0, w: 2, h: 2 },
    { i: 'tps-kpi',         x: 4,  y: 0, w: 2, h: 2 },
    { i: 'mspt-kpi',        x: 6,  y: 0, w: 2, h: 2 },
    { i: 'players-kpi',     x: 8,  y: 0, w: 2, h: 2 },
    { i: 'uptime-kpi',      x: 10, y: 0, w: 2, h: 2 },

    { i: 'resource-chart',  x: 0,  y: 2, w: 8, h: 5 },
    { i: 'connection',      x: 8,  y: 2, w: 4, h: 5 },

    { i: 'online-players',  x: 0,  y: 7, w: 4, h: 5 },
    { i: 'active-profile',  x: 4,  y: 7, w: 4, h: 5 },
    { i: 'scheduled-tasks', x: 8,  y: 7, w: 4, h: 5 },
];
