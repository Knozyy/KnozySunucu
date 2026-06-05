# Dashboard Widget Sistemi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut DashboardPage kartlarını sürükle-bırak/boyutlandırılabilir bağımsız widget'lara dönüştür; yerleşimi kullanıcı başına backend'de sakla.

**Architecture:** `react-grid-layout` ile 12 kolonluk grid. Her kart bağımsız widget bileşenine taşınır. `useWidgetLayout` hook'u GET/PUT `/api/dashboard/layout` üzerinden yerleşimi yükler/kaydeder. `app_settings` tablosunda `dashboard_layout_<userId>` key ile JSON saklanır.

**Tech Stack:** React 19, react-grid-layout, @tanstack/react-query, axios (api.js), HooDoo design system (A tokens, I icons, Card/KPI/KV/Stat primitifleri), better-sqlite3 (mevcut getDb() pattern)

---

## Dosya Yapısı

**Oluşturulacak:**
```
server/routes/dashboard.js
client/src/components/Dashboard/
  ├── widgets/
  │   ├── CpuKpi.jsx
  │   ├── RamKpi.jsx
  │   ├── PlayersKpi.jsx
  │   ├── StatusKpi.jsx
  │   ├── UptimeKpi.jsx
  │   ├── ProfileKpi.jsx
  │   ├── ResourceChart.jsx
  │   ├── ServerInfoWidget.jsx
  │   ├── OnlinePlayersWidget.jsx
  │   ├── ActiveProfileWidget.jsx
  │   └── QuickActionsWidget.jsx
  ├── WidgetWrapper.jsx
  ├── WidgetGrid.jsx
  ├── widgetMap.js
  ├── defaultLayout.js
  └── useWidgetLayout.js
```

**Değiştirilecek:**
- `client/package.json` — react-grid-layout bağımlılığı
- `client/src/utils/formatters.js` — parseRamGB helper eklenir
- `server/index.js` — dashboard route kaydı
- `client/src/pages/DashboardPage.jsx` — widget sistemi ile yeniden yazılır

---

## Task 1: react-grid-layout Kur

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Bağımlılığı yükle**

```bash
cd client && npm install react-grid-layout
```

Beklenen: `added 2 packages` (react-grid-layout + react-resizable)

- [ ] **Step 2: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: react-grid-layout bağımlılığı eklendi"
```

---

## Task 2: parseRamGB Helper

**Files:**
- Modify: `client/src/utils/formatters.js`

- [ ] **Step 1: parseRamGB fonksiyonunu dosyanın sonuna ekle**

```js
// client/src/utils/formatters.js — mevcut fonksiyonların sonuna ekle

export function parseRamGB(str) {
    if (!str) return 0;
    const m = String(str).match(/^(\d+)([GgMm])$/);
    if (!m) return 0;
    return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : parseInt(m[1]) / 1024;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/formatters.js
git commit -m "feat(dashboard): parseRamGB yardımcı fonksiyonu eklendi"
```

---

## Task 3: Backend Route

**Files:**
- Create: `server/routes/dashboard.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// server/routes/dashboard.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/dashboard/layout — kullanıcıya ait layout JSON döner
router.get('/layout', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const key = `dashboard_layout_${req.user.id}`;
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
        if (!row) return res.json({ layout: null });
        res.json({ layout: JSON.parse(row.value) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dashboard/layout — layout JSON'u app_settings'e kaydeder
router.put('/layout', authMiddleware, (req, res) => {
    try {
        const { layout } = req.body;
        if (!Array.isArray(layout)) return res.status(400).json({ error: 'layout array olmalı' });
        const db = getDb();
        const key = `dashboard_layout_${req.user.id}`;
        db.prepare(`
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(key, JSON.stringify(layout));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/dashboard.js
git commit -m "feat(dashboard): layout GET/PUT endpoint'leri eklendi"
```

---

## Task 4: Route Kaydı

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Dosyanın 35. satırındaki `serverListRoutes` satırının hemen altına ekle**

```js
const dashboardRoutes = require('./routes/dashboard');
```

- [ ] **Step 2: `app.use('/api/servers', serverListRoutes);` satırının hemen altına ekle**

```js
app.use('/api/dashboard', dashboardRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(dashboard): dashboard route kaydedildi"
```

---

## Task 5: defaultLayout.js

**Files:**
- Create: `client/src/components/Dashboard/defaultLayout.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Dashboard/defaultLayout.js
git commit -m "feat(dashboard): varsayılan widget yerleşimi eklendi"
```

---

## Task 6: useWidgetLayout Hook

**Files:**
- Create: `client/src/components/Dashboard/useWidgetLayout.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// client/src/components/Dashboard/useWidgetLayout.js
import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { DEFAULT_LAYOUT } from './defaultLayout';

export function useWidgetLayout() {
    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    const [savedLayout, setSavedLayout] = useState(DEFAULT_LAYOUT);
    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(true);

    // Mount'ta layout yükle
    useEffect(() => {
        api.get('/dashboard/layout')
            .then(r => {
                if (r.data?.layout && Array.isArray(r.data.layout) && r.data.layout.length > 0) {
                    setLayout(r.data.layout);
                    setSavedLayout(r.data.layout);
                }
            })
            .catch(() => { /* varsayılan layout kullan */ })
            .finally(() => setLoading(false));
    }, []);

    const save = useCallback(async (currentLayout) => {
        const toSave = currentLayout || layout;
        await api.put('/dashboard/layout', { layout: toSave });
        setSavedLayout(toSave);
        setEditMode(false);
    }, [layout]);

    const cancel = useCallback(() => {
        setLayout(savedLayout);
        setEditMode(false);
    }, [savedLayout]);

    const reset = useCallback(async () => {
        setLayout(DEFAULT_LAYOUT);
        await api.put('/dashboard/layout', { layout: DEFAULT_LAYOUT });
        setSavedLayout(DEFAULT_LAYOUT);
        setEditMode(false);
    }, []);

    const toggleEditMode = useCallback(() => setEditMode(prev => !prev), []);

    const deleteWidget = useCallback((widgetId) => {
        setLayout(prev => prev.filter(item => item.i !== widgetId));
    }, []);

    const addWidget = useCallback((widgetId) => {
        const defaultItem = DEFAULT_LAYOUT.find(item => item.i === widgetId);
        if (!defaultItem) return;
        // Mevcut en alt y konumunu bul
        setLayout(prev => {
            const maxY = prev.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
            return [...prev, { ...defaultItem, y: maxY }];
        });
    }, []);

    const hiddenWidgets = DEFAULT_LAYOUT.filter(d => !layout.find(l => l.i === d.i));

    return {
        layout, setLayout,
        editMode, toggleEditMode,
        loading,
        save, cancel, reset,
        deleteWidget, addWidget,
        hiddenWidgets,
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Dashboard/useWidgetLayout.js
git commit -m "feat(dashboard): useWidgetLayout hook eklendi"
```

---

## Task 7: KPI Widget Bileşenleri (6 adet)

**Files:**
- Create: `client/src/components/Dashboard/widgets/CpuKpi.jsx`
- Create: `client/src/components/Dashboard/widgets/RamKpi.jsx`
- Create: `client/src/components/Dashboard/widgets/PlayersKpi.jsx`
- Create: `client/src/components/Dashboard/widgets/StatusKpi.jsx`
- Create: `client/src/components/Dashboard/widgets/UptimeKpi.jsx`
- Create: `client/src/components/Dashboard/widgets/ProfileKpi.jsx`

- [ ] **Step 1: CpuKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/CpuKpi.jsx
import { KPI } from '@/hoodoo/primitives';

export function CpuKpi({ server, series }) {
    const cpu = server?.processStats?.cpuPercent || 0;
    const cpuVals = (series || []).map(s => s.cpu);
    return <KPI label="CPU" value={cpu.toFixed(1)} unit="%" spark={cpuVals} sparkMax={100}/>;
}
```

- [ ] **Step 2: RamKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/RamKpi.jsx
import { KPI } from '@/hoodoo/primitives';
import { parseRamGB } from '@/utils/formatters';

export function RamKpi({ server, series }) {
    const ramMB = server?.processStats?.memoryMB || 0;
    const maxRamGB = parseRamGB(server?.max_ram) || 8;
    const ramGB = ramMB / 1024;
    const ramPct = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;
    const ramVals = (series || []).map(s => s.ram);
    return (
        <KPI label="RAM"
            value={ramGB.toFixed(2)}
            unit={` / ${maxRamGB} GB`}
            sub={`${ramPct.toFixed(0)}%`}
            spark={ramVals}
            sparkMax={100}/>
    );
}
```

- [ ] **Step 3: PlayersKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/PlayersKpi.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { KPI } from '@/hoodoo/primitives';

export function PlayersKpi({ server }) {
    const { data } = useQuery({
        queryKey: ['players-online', server?.id],
        queryFn: () => api.get(`/players/online?serverId=${server?.id}`).then(r => r.data),
        refetchInterval: 5000,
        enabled: !!server?.id,
    });
    const count = data?.players?.length || 0;
    return (
        <KPI label="OYUNCU"
            value={count}
            unit="/20"
            sub={server?.status === 'running' ? 'online' : 'offline'}/>
    );
}
```

- [ ] **Step 4: StatusKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/StatusKpi.jsx
import { KPI } from '@/hoodoo/primitives';

export function StatusKpi({ server }) {
    return (
        <KPI label="STATUS"
            value={(server?.status || '—').toUpperCase()}
            sub={server?.port ? `port ${server.port}` : '—'}/>
    );
}
```

- [ ] **Step 5: UptimeKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/UptimeKpi.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { KPI } from '@/hoodoo/primitives';
import { formatUptime } from '@/utils/formatters';

export function UptimeKpi({ server }) {
    const { data } = useQuery({
        queryKey: ['system-uptime'],
        queryFn: () => api.get('/system/uptime').then(r => r.data),
        refetchInterval: 30000,
        enabled: !!server?.id,
    });
    return (
        <KPI label="UPTIME"
            value={data?.uptime ? formatUptime(data.uptime) : '—'}
            sub="çalışma süresi"/>
    );
}
```

- [ ] **Step 6: ProfileKpi.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/ProfileKpi.jsx
import { KPI } from '@/hoodoo/primitives';

export function ProfileKpi({ server, installedModpacks }) {
    const activePack = (installedModpacks || []).find(p => p.id === server?.active_modpack_id);
    return (
        <KPI label="PROFİL"
            value={activePack?.name || '—'}
            sub={activePack?.version ? `v${activePack.version}` : ''}/>
    );
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Dashboard/widgets/
git commit -m "feat(dashboard): 6 KPI widget bileşeni eklendi"
```

---

## Task 8: Büyük Widget Bileşenleri — Grafik & Bilgi

**Files:**
- Create: `client/src/components/Dashboard/widgets/ResourceChart.jsx`
- Create: `client/src/components/Dashboard/widgets/ServerInfoWidget.jsx`

- [ ] **Step 1: ResourceChart.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/ResourceChart.jsx
import { A } from '@/hoodoo/tokens';
import { Card, Stat, LegendDot } from '@/hoodoo/primitives';
import { DualLine, avg, max } from '@/hoodoo/charts';

export function ResourceChart({ series }) {
    const cpuVals = (series || []).map(s => s.cpu);
    const ramVals = (series || []).map(s => s.ram);
    return (
        <Card title="Kaynaklar (60s · canlı)" accent="var(--accent)"
            style={{ height: '100%' }}
            action={
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <LegendDot color="var(--accent)" label="CPU"/>
                    <LegendDot color={A.ok} label="RAM" dashed/>
                </div>
            }>
            <DualLine a={cpuVals} b={ramVals} width={780} height={110}
                strokeA="var(--accent)" strokeB={A.ok}/>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${A.border}`,
            }}>
                <Stat label="CPU avg" value={`${avg(cpuVals).toFixed(1)}%`}/>
                <Stat label="CPU peak" value={`${max(cpuVals).toFixed(1)}%`}/>
                <Stat label="RAM avg" value={`${avg(ramVals).toFixed(1)}%`}/>
                <Stat label="RAM peak" value={`${max(ramVals).toFixed(1)}%`}/>
            </div>
        </Card>
    );
}
```

- [ ] **Step 2: ServerInfoWidget.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/ServerInfoWidget.jsx
import { A } from '@/hoodoo/tokens';
import { Card, KV } from '@/hoodoo/primitives';

export function ServerInfoWidget({ server }) {
    return (
        <Card title="Sunucu Bilgisi" accent={A.ok} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <KV label="ad"      value={server?.name || '—'} mono/>
                <KV label="port"    value={server?.port || '—'} mono/>
                <KV label="ram min" value={server?.min_ram || '—'} mono/>
                <KV label="ram max" value={server?.max_ram || '—'} mono/>
                <KV label="path"    value={server?.path || '—'} mono valueColor={A.dim}/>
                <KV label="durum"   value={server?.status || '—'} mono valueColor={
                    server?.status === 'running' ? A.ok :
                    server?.status === 'starting' ? A.warn : A.dim
                }/>
            </div>
        </Card>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Dashboard/widgets/ResourceChart.jsx \
        client/src/components/Dashboard/widgets/ServerInfoWidget.jsx
git commit -m "feat(dashboard): ResourceChart ve ServerInfoWidget eklendi"
```

---

## Task 9: Büyük Widget Bileşenleri — Oyuncu, Profil, Eylemler

**Files:**
- Create: `client/src/components/Dashboard/widgets/OnlinePlayersWidget.jsx`
- Create: `client/src/components/Dashboard/widgets/ActiveProfileWidget.jsx`
- Create: `client/src/components/Dashboard/widgets/QuickActionsWidget.jsx`

- [ ] **Step 1: OnlinePlayersWidget.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/OnlinePlayersWidget.jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { A } from '@/hoodoo/tokens';
import { Card, Dot } from '@/hoodoo/primitives';

export function OnlinePlayersWidget({ server }) {
    const { data } = useQuery({
        queryKey: ['players-online', server?.id],
        queryFn: () => api.get(`/players/online?serverId=${server?.id}`).then(r => r.data),
        refetchInterval: 5000,
        enabled: !!server?.id,
    });
    const players = data?.players || [];

    return (
        <Card title={`Online Oyuncular · ${players.length}`} accent="var(--accent)"
            style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 220 }}>
                {players.length === 0 ? (
                    <div style={{ color: A.faint, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                        Şu an online oyuncu yok
                    </div>
                ) : players.map((p, i) => (
                    <div key={p} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0',
                        borderTop: i ? `1px solid ${A.border}` : 'none',
                    }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: 1, flexShrink: 0,
                            background: 'var(--accent)', display: 'grid',
                            placeItems: 'center', color: A.bg,
                            fontFamily: A.mono, fontWeight: 700, fontSize: 10,
                        }}>{p.slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1, fontSize: 12, color: A.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
                        <Dot color={A.ok} size={6}/>
                    </div>
                ))}
            </div>
        </Card>
    );
}
```

- [ ] **Step 2: ActiveProfileWidget.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/ActiveProfileWidget.jsx
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A } from '@/hoodoo/tokens';
import { Card, Cap, Pill } from '@/hoodoo/primitives';
import { UsageBar } from '@/hoodoo/charts';
import { parseRamGB } from '@/utils/formatters';

export function ActiveProfileWidget({ server, installedModpacks }) {
    const qc = useQueryClient();
    const activePack = (installedModpacks || []).find(p => p.id === server?.active_modpack_id);
    const ramMB = server?.processStats?.memoryMB || 0;
    const maxRamGB = parseRamGB(server?.max_ram) || 8;
    const ramGB = ramMB / 1024;
    const ramPct = maxRamGB > 0 ? Math.min(100, (ramGB / maxRamGB) * 100) : 0;

    const [selectedPack, setSelectedPack] = useState(server?.active_modpack_id ?? null);
    useEffect(() => { setSelectedPack(server?.active_modpack_id ?? null); }, [server?.id, server?.active_modpack_id]);

    const setProfileM = useMutation({
        mutationFn: (modpack_id) => api.post(`/servers/${server?.id}/set-profile`, { modpack_id }),
        onSuccess: () => { toast.success('Profil atandı'); qc.invalidateQueries({ queryKey: ['servers-status-dash'] }); },
        onError: (e) => { toast.error(e.response?.data?.error || 'Profil atanamadı'); setSelectedPack(server?.active_modpack_id ?? null); },
    });

    return (
        <Card title="Aktif Profil" accent={A.ok} style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activePack ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: A.text }}>{activePack.name}</div>
                                <div style={{ fontSize: 11, color: A.faint, marginTop: 2, fontFamily: A.mono }}>v{activePack.version || '?'}</div>
                            </div>
                            <Pill color={A.ok} bg="rgba(74,222,128,0.10)">ACTIVE</Pill>
                        </div>
                        <div style={{ paddingTop: 8, borderTop: `1px solid ${A.border}` }}>
                            <Cap>HEAP</Cap>
                            <UsageBar value={ramPct} color="var(--accent)"/>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: A.mono, fontSize: 11, color: A.dim, marginTop: 4 }}>
                                <span>{ramGB.toFixed(2)} / {maxRamGB} GB</span>
                                <span>{ramPct.toFixed(0)}%</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ color: A.faint, fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
                        Henüz profil atanmamış
                    </div>
                )}
                <select
                    value={selectedPack || ''}
                    onChange={(e) => {
                        const id = e.target.value ? parseInt(e.target.value) : null;
                        setSelectedPack(id);
                        setProfileM.mutate(id);
                    }}
                    style={{
                        background: A.bg, border: `1px solid ${A.border}`,
                        color: A.text, fontFamily: A.mono, fontSize: 11,
                        padding: '6px 8px', borderRadius: 2, outline: 'none', marginTop: 'auto',
                    }}>
                    <option value="">— profil seç —</option>
                    {(installedModpacks || []).map(mp => {
                        const isUsed = mp._usedByServerId && mp._usedByServerId !== server?.id;
                        return (
                            <option key={mp.id} value={mp.id} disabled={isUsed}>
                                {mp.name}{isUsed ? ` (sunucu ${mp._usedByName})` : ''}
                            </option>
                        );
                    })}
                </select>
            </div>
        </Card>
    );
}
```

- [ ] **Step 3: QuickActionsWidget.jsx oluştur**

```jsx
// client/src/components/Dashboard/widgets/QuickActionsWidget.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnPrimary, btnGhost } from '@/hoodoo/tokens';
import { Card, Pill } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';

export function QuickActionsWidget({ server }) {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['servers-status-dash'] });

    const startM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/start`),
        onSuccess: () => { toast.success('Başlatılıyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const stopM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/stop`),
        onSuccess: () => { toast.success('Durduruluyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const restartM = useMutation({
        mutationFn: () => api.post(`/servers/${server?.id}/restart`),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); invalidate(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    const isRunning = server?.status === 'running';
    const isStarting = server?.status === 'starting';
    const isStopping = server?.status === 'stopping';

    return (
        <Card title="Hızlı İşlemler" style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isRunning && !isStarting && (
                    <button onClick={() => startM.mutate()} disabled={startM.isPending}
                        style={{ ...btnPrimary, opacity: startM.isPending ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <I.Play size={11}/>BAŞLAT
                    </button>
                )}
                {(isRunning || isStarting) && (
                    <>
                        <button onClick={() => stopM.mutate()} disabled={stopM.isPending}
                            style={{ ...btnGhost, opacity: stopM.isPending ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <I.Stop size={11}/>DURDUR
                        </button>
                        <button onClick={() => restartM.mutate()} disabled={restartM.isPending}
                            style={{ ...btnGhost, opacity: restartM.isPending ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <I.Restart size={11}/>YENİDEN BAŞLAT
                        </button>
                    </>
                )}
                {isStopping && <Pill color={A.warn} bg="rgba(251,191,36,0.10)">DURDURULUYOR</Pill>}
                {!server && (
                    <div style={{ fontSize: 12, color: A.faint, textAlign: 'center', padding: '8px 0' }}>
                        Sunucu seçilmedi
                    </div>
                )}
            </div>
        </Card>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Dashboard/widgets/OnlinePlayersWidget.jsx \
        client/src/components/Dashboard/widgets/ActiveProfileWidget.jsx \
        client/src/components/Dashboard/widgets/QuickActionsWidget.jsx
git commit -m "feat(dashboard): OnlinePlayers, ActiveProfile, QuickActions widget'ları eklendi"
```

---

## Task 10: widgetMap.js

**Files:**
- Create: `client/src/components/Dashboard/widgetMap.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// client/src/components/Dashboard/widgetMap.js
import { CpuKpi } from './widgets/CpuKpi';
import { RamKpi } from './widgets/RamKpi';
import { PlayersKpi } from './widgets/PlayersKpi';
import { StatusKpi } from './widgets/StatusKpi';
import { UptimeKpi } from './widgets/UptimeKpi';
import { ProfileKpi } from './widgets/ProfileKpi';
import { ResourceChart } from './widgets/ResourceChart';
import { ServerInfoWidget } from './widgets/ServerInfoWidget';
import { OnlinePlayersWidget } from './widgets/OnlinePlayersWidget';
import { ActiveProfileWidget } from './widgets/ActiveProfileWidget';
import { QuickActionsWidget } from './widgets/QuickActionsWidget';

export const WIDGET_LABELS = {
    'cpu-kpi':        'CPU',
    'ram-kpi':        'RAM',
    'players-kpi':    'Oyuncular',
    'status-kpi':     'Durum',
    'uptime-kpi':     'Uptime',
    'profile-kpi':    'Profil',
    'resource-chart': 'Kaynak Grafiği',
    'server-info':    'Sunucu Bilgisi',
    'online-players': 'Online Oyuncular',
    'active-profile': 'Aktif Profil',
    'quick-actions':  'Hızlı İşlemler',
};

export const WIDGET_MAP = {
    'cpu-kpi':        CpuKpi,
    'ram-kpi':        RamKpi,
    'players-kpi':    PlayersKpi,
    'status-kpi':     StatusKpi,
    'uptime-kpi':     UptimeKpi,
    'profile-kpi':    ProfileKpi,
    'resource-chart': ResourceChart,
    'server-info':    ServerInfoWidget,
    'online-players': OnlinePlayersWidget,
    'active-profile': ActiveProfileWidget,
    'quick-actions':  QuickActionsWidget,
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Dashboard/widgetMap.js
git commit -m "feat(dashboard): widget map ve label listesi eklendi"
```

---

## Task 11: WidgetWrapper.jsx

**Files:**
- Create: `client/src/components/Dashboard/WidgetWrapper.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
// client/src/components/Dashboard/WidgetWrapper.jsx
import { A } from '@/hoodoo/tokens';

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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Dashboard/WidgetWrapper.jsx
git commit -m "feat(dashboard): WidgetWrapper edit modu bileşeni eklendi"
```

---

## Task 12: WidgetGrid.jsx

**Files:**
- Create: `client/src/components/Dashboard/WidgetGrid.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Dashboard/WidgetGrid.jsx
git commit -m "feat(dashboard): WidgetGrid react-grid-layout container eklendi"
```

---

## Task 13: DashboardPage.jsx Refactor

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Dosyanın tamamını yeni içerikle değiştir**

```jsx
// client/src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { A, btnGhost, btnPrimary } from '@/hoodoo/tokens';
import { Dot, Pill, Card } from '@/hoodoo/primitives';
import { I } from '@/hoodoo/icons';
import { WidgetGrid } from '@/components/Dashboard/WidgetGrid';
import { useWidgetLayout } from '@/components/Dashboard/useWidgetLayout';
import { WIDGET_LABELS } from '@/components/Dashboard/widgetMap';

// ─── Live series (CPU/RAM 60 örnek halka tampon) ─────────────────────────
function useLiveSeries() {
    const { data: serversData } = useQuery({
        queryKey: ['servers-status-dash'],
        queryFn: () => api.get('/servers/status-all').then(r => r.data),
        refetchInterval: 3000,
    });
    const servers = serversData?.servers || [];

    const [series, setSeries] = useState(
        Array(60).fill(null).map(() => ({ cpu: 0, ram: 0 }))
    );

    useEffect(() => {
        const def = servers[0];
        if (!def) return;
        const cpu = def.processStats?.cpuPercent || 0;
        const ramMB = def.processStats?.memoryMB || 0;
        const maxRamGB = parseRamGBLocal(def.max_ram) || 8;
        const ram = Math.min(100, (ramMB / (maxRamGB * 1024)) * 100);
        setSeries(prev => [...prev.slice(1), { cpu, ram }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serversData]);

    return { servers, series };
}

function parseRamGBLocal(str) {
    if (!str) return 0;
    const m = String(str).match(/^(\d+)([GgMm])$/);
    if (!m) return 0;
    return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : parseInt(m[1]) / 1024;
}

// ─── Sunucu sekmesi ──────────────────────────────────────────────────────
function ServerTab({ server, active, onClick, index }) {
    const isRunning = server.status === 'running';
    const isStarting = server.status === 'starting';
    return (
        <button onClick={onClick} className="hoodoo-navitem"
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', cursor: 'pointer',
                background: active ? A.panel : 'transparent',
                border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? A.text : A.dim, fontSize: 12, fontWeight: 500,
                fontFamily: A.sans, whiteSpace: 'nowrap',
            }}>
            <Dot color={isRunning ? A.ok : isStarting ? A.warn : A.faint} size={6}/>
            <span style={{ color: active ? A.text : A.dim }}>Sunucu {index + 1}</span>
            <span style={{ color: A.faint, fontSize: 11, fontFamily: A.mono }}>— {server.name}</span>
        </button>
    );
}

// ─── Sunucu kontrol butonları ────────────────────────────────────────────
function ServerControls({ server, onStatusChange }) {
    const isRunning = server.status === 'running';
    const isStarting = server.status === 'starting';
    const isStopping = server.status === 'stopping';

    const startM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/start`),
        onSuccess: () => { toast.success('Başlatılıyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const stopM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/stop`),
        onSuccess: () => { toast.success('Durduruluyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });
    const restartM = useMutation({
        mutationFn: () => api.post(`/servers/${server.id}/restart`),
        onSuccess: () => { toast.success('Yeniden başlatılıyor...'); onStatusChange(); },
        onError: (e) => toast.error(e.response?.data?.error || 'Hata'),
    });

    return (
        <div style={{ display: 'flex', gap: 8 }}>
            {!isRunning && !isStarting && (
                <button onClick={() => startM.mutate()} disabled={startM.isPending}
                    style={{ ...btnPrimary, opacity: startM.isPending ? 0.5 : 1 }}>
                    <I.Play size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>BAŞLAT
                </button>
            )}
            {(isRunning || isStarting) && (
                <>
                    <button onClick={() => stopM.mutate()} disabled={stopM.isPending} style={btnGhost}>
                        <I.Stop size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>DURDUR
                    </button>
                    <button onClick={() => restartM.mutate()} disabled={restartM.isPending} style={btnGhost}>
                        <I.Restart size={11} style={{ marginRight: 4, verticalAlign: -1 }}/>YENİDEN
                    </button>
                </>
            )}
            {isStopping && <Pill color={A.warn} bg="rgba(251,191,36,0.10)">DURDURULUYOR</Pill>}
        </div>
    );
}

// ─── Ana Dashboard ───────────────────────────────────────────────────────
export default function DashboardPage() {
    const qc = useQueryClient();
    const { servers, series } = useLiveSeries();
    const [selectedServerId, setSelectedServerId] = useState(null);
    const {
        layout, setLayout,
        editMode, toggleEditMode,
        loading,
        save, cancel, reset,
        deleteWidget, addWidget,
        hiddenWidgets,
    } = useWidgetLayout();

    const { data: installedData } = useQuery({
        queryKey: ['modpacks-installed'],
        queryFn: () => api.get('/modpacks/installed').then(r => r.data),
    });

    const installedModpacks = useMemo(() => {
        const list = installedData?.modpacks || [];
        return list.map(mp => {
            const usedBy = servers.find(s => s.active_modpack_id === mp.id);
            return { ...mp, _usedByServerId: usedBy?.id || null, _usedByName: usedBy?.name || null };
        });
    }, [installedData, servers]);

    useEffect(() => {
        if (!selectedServerId && servers.length > 0) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];
    const onStatusChange = () => qc.invalidateQueries({ queryKey: ['servers-status-dash'] });

    if (!servers.length) {
        return (
            <Card title="Sunucu yok" padding={24}>
                <div style={{ color: A.faint, fontSize: 13, fontFamily: A.mono, lineHeight: 1.6 }}>
                    Henüz tanımlı bir sunucu yok.{' '}
                    <a href="/servers" style={{ color: 'var(--accent)' }}>Sunucular sayfasından</a> ilk sunucuyu ekleyin.
                </div>
            </Card>
        );
    }

    if (!selectedServer) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ── Sunucu sekmeleri + kontroller ── */}
            <div style={{
                background: A.bgDeeper, border: `1px solid ${A.border}`, borderRadius: 4,
                display: 'flex', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
                    {servers.map((s, i) => (
                        <ServerTab key={s.id} server={s} index={i}
                            active={s.id === selectedServerId}
                            onClick={() => setSelectedServerId(s.id)}/>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderLeft: `1px solid ${A.border}` }}>
                    <ServerControls server={selectedServer} onStatusChange={onStatusChange}/>
                    <button onClick={toggleEditMode} style={{
                        ...btnGhost, fontSize: 10,
                        display: 'flex', alignItems: 'center', gap: 5,
                        borderColor: editMode ? 'var(--accent)' : A.border,
                        color: editMode ? 'var(--accent)' : A.dim,
                    }}>
                        <I.Cog size={11}/>{editMode ? 'DÜZENLEME' : 'DÜZENLE'}
                    </button>
                </div>
            </div>

            {/* ── Edit modu araç çubuğu ── */}
            {editMode && (
                <div style={{
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 4, padding: '10px 16px',
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                    <span style={{ fontSize: 12, color: A.dim, flex: 1, minWidth: 120 }}>
                        Widget'ları sürükle-bırak ile taşı, köşeden boyutlandır
                    </span>
                    {hiddenWidgets.length > 0 && hiddenWidgets.map(w => (
                        <button key={w.i} onClick={() => addWidget(w.i)}
                            style={{ ...btnGhost, fontSize: 10 }}>
                            + {WIDGET_LABELS[w.i] || w.i}
                        </button>
                    ))}
                    <button onClick={async () => { try { await reset(); toast.success('Yerleşim sıfırlandı'); } catch { toast.error('Sıfırlama başarısız'); } }}
                        style={{ ...btnGhost, fontSize: 10 }}>Sıfırla</button>
                    <button onClick={cancel} style={{ ...btnGhost, fontSize: 10 }}>İptal</button>
                    <button onClick={async () => { try { await save(); toast.success('Yerleşim kaydedildi'); } catch { toast.error('Kaydetme başarısız'); } }}
                        style={{ ...btnPrimary, fontSize: 10 }}>Kaydet</button>
                </div>
            )}

            {/* ── Widget grid ── */}
            {!loading && (
                <WidgetGrid
                    server={selectedServer}
                    series={series}
                    installedModpacks={installedModpacks}
                    layout={layout}
                    editMode={editMode}
                    onLayoutChange={setLayout}
                    onDeleteWidget={deleteWidget}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Manuel test — geliştirme sunucusunu başlat**

```bash
cd client && npm run dev
```

Kontrol listesi:
- ✅ Dashboard yükleniyor, mevcut layout görünüyor
- ✅ Widget'lar (KPI'lar, chart, player listesi vb.) render oluyor
- ✅ "DÜZENLE" butonuna tıklayınca editMode banner'ı açılıyor
- ✅ Drag handle ile widget'lar sürüklenebiliyor
- ✅ Widget köşesinden boyutlandırılabiliyor
- ✅ "×" ile widget silinince kaybolup "+" butonu çıkıyor
- ✅ "+" ile silinmiş widget geri ekleniyor
- ✅ "Kaydet" → toast çıkıyor, edit modu kapanıyor
- ✅ Sayfayı yenile → kaydedilen yerleşim geri geliyor
- ✅ "İptal" → değişiklikler geri alınıyor

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat(dashboard): Dashboard widget sistemi tamamlandı — sürükle-bırak + backend persist"
```

---

## Task 14: Push ve PR

- [ ] **Step 1: Branch'i push et**

```bash
git push origin claude/admiring-keller-de4491
```

- [ ] **Step 2: PR aç**

```bash
gh pr create \
  --title "feat: Dashboard widget sistemi (sürükle-bırak, backend persist)" \
  --body "## Dashboard Widget Sistemi

Mevcut dashboard kartları bağımsız, sürükle-bırak widget'lara dönüştürüldü.

### Özellikler
- 🎛️ 11 widget bileşeni (6 KPI + 5 büyük kart)
- ↕️ react-grid-layout ile sürükle-bırak + köşe boyutlandırma
- 💾 Kullanıcı başına yerleşim backend'de (app_settings) saklanır
- ✏️ Edit modu: drag handle + delete + resize görselleri
- ➕ Silinen widget'ları geri ekle butonu
- 🔄 Varsayılan yerleşime sıfırla

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
