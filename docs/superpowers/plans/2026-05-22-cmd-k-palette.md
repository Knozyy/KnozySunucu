# CMD+K Komut Paleti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Ctrl+K` / `Cmd+K` ile açılan global komut paleti — sayfa navigasyonu, sunucu eylemleri, oyuncu arama ve dosya erişimini tek arayüzde sağlar.

**Architecture:** React Portal ile `document.body`'e bağlı modal overlay. `App.jsx` seviyesinde render edilir, global `keydown` listener ile tetiklenir. Fuse.js ile fuzzy search, 300ms debounce ile canlı oyuncu araması.

**Tech Stack:** React 19, react-router-dom v7, fuse.js, Knozy design system (`A` tokens, `I` icons), axios (`api.js`)

---

## Dosya Yapısı

**Oluşturulacak:**
```
client/src/components/CommandPalette/
  ├── commandRegistry.js     — statik sayfa + eylem + dosya tanımları
  ├── useCommandPalette.js   — open/close/query/index state hook
  ├── CommandItem.jsx        — tek sonuç satırı bileşeni
  ├── CommandPalette.jsx     — ana modal (portal, arama, sonuçlar, confirm)
  └── index.js               — barrel export
```

**Değiştirilecek:**
- `client/package.json` — `fuse.js` bağımlılığı
- `client/src/App.jsx` — `<CommandPalette />` render + hook bağlantısı

---

## Task 1: fuse.js Kur

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: fuse.js'i yükle**

```bash
cd client && npm install fuse.js
```

Beklenen çıktı: `added 1 package` ve `package.json`'da `"fuse.js": "^7.x.x"` görünür.

- [ ] **Step 2: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: fuse.js bağımlılığı eklendi (CMD+K paleti için)"
```

---

## Task 2: commandRegistry.js

**Files:**
- Create: `client/src/components/CommandPalette/commandRegistry.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// client/src/components/CommandPalette/commandRegistry.js

export const PAGES = [
    { id: 'page-dashboard',   label: 'Dashboard',    description: 'Ana panel',              path: '/',            icon: 'Dashboard' },
    { id: 'page-console',     label: 'Console',      description: 'Sunucu konsolu',          path: '/console',     icon: 'Console'   },
    { id: 'page-terminal',    label: 'Terminal',     description: 'Web terminali',           path: '/terminal',    icon: 'Terminal'  },
    { id: 'page-players',     label: 'Oyuncular',    description: 'Oyuncu yönetimi',         path: '/players',     icon: 'Users'     },
    { id: 'page-worlds',      label: 'Dünyalar',     description: 'Dünya yönetimi',          path: '/worlds',      icon: 'World'     },
    { id: 'page-files',       label: 'Dosyalar',     description: 'Dosya yöneticisi',        path: '/files',       icon: 'Folder'    },
    { id: 'page-mods',        label: 'Modlar',       description: 'Mod yönetimi',            path: '/mods',        icon: 'Cube'      },
    { id: 'page-modpacks',    label: "Modpack'ler",  description: 'Modpack profilleri',      path: '/modpacks',    icon: 'Stack'     },
    { id: 'page-scheduler',   label: 'Zamanlayıcı',  description: 'Zamanlanmış görevler',    path: '/scheduler',   icon: 'Clock'     },
    { id: 'page-backup',      label: 'Yedekleme',    description: 'Sunucu yedekleri',        path: '/backup',      icon: 'Archive'   },
    { id: 'page-settings',    label: 'Ayarlar',      description: 'Sunucu ayarları',         path: '/settings',    icon: 'Cog'       },
    { id: 'page-discord',     label: 'Discord',      description: 'Discord entegrasyonu',    path: '/discord',     icon: 'Globe'     },
    { id: 'page-automation',  label: 'Otomasyon',    description: 'Otomasyon kuralları',     path: '/automation',  icon: 'Wrench'    },
    { id: 'page-performance', label: 'Performans',   description: 'CPU / RAM izleme',        path: '/performance', icon: 'Signal'    },
    { id: 'page-servers',     label: 'Sunucular',    description: 'Sunucu listesi',          path: '/servers',     icon: 'Server'    },
];

// confirm: true → işlem öncesi onay kutusu gösterilir
export const ACTIONS = [
    {
        id: 'action-restart',
        label: 'Sunucuyu Yeniden Başlat',
        description: 'Minecraft sunucusunu restart et',
        icon: 'Restart',
        apiMethod: 'post',
        apiPath: '/system/restart',
        confirm: true,
        confirmMsg: 'Sunucuyu yeniden başlatmak istediğine emin misin?',
    },
    {
        id: 'action-stop',
        label: 'Sunucuyu Durdur',
        description: 'Minecraft sunucusunu durdur',
        icon: 'Stop',
        apiMethod: 'post',
        apiPath: '/system/stop',
        confirm: true,
        confirmMsg: 'Sunucuyu durdurmak istediğine emin misin?',
    },
    {
        id: 'action-backup',
        label: 'Yedek Al',
        description: 'Hemen yedek oluştur',
        icon: 'Archive',
        apiMethod: 'post',
        apiPath: '/backup/create',
        confirm: false,
    },
];

export const COMMON_FILES = [
    { id: 'file-server-props', label: 'server.properties', description: 'Sunucu ana konfigürasyonu', path: '/files', icon: 'Folder' },
    { id: 'file-ops',          label: 'ops.json',          description: 'Op listesi',                path: '/files', icon: 'Folder' },
    { id: 'file-whitelist',    label: 'whitelist.json',     description: 'Whitelist listesi',         path: '/files', icon: 'Folder' },
    { id: 'file-eula',         label: 'eula.txt',           description: 'EULA dosyası',              path: '/files', icon: 'Folder' },
];
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CommandPalette/commandRegistry.js
git commit -m "feat(cmd-k): komut registry'si oluşturuldu"
```

---

## Task 3: useCommandPalette.js Hook

**Files:**
- Create: `client/src/components/CommandPalette/useCommandPalette.js`

- [ ] **Step 1: Hook dosyasını oluştur**

```js
// client/src/components/CommandPalette/useCommandPalette.js
import { useState, useEffect, useCallback } from 'react';

export function useCommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const openPalette = useCallback(() => {
        setOpen(true);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    const closePalette = useCallback(() => {
        setOpen(false);
        setQuery('');
        setSelectedIndex(0);
    }, []);

    // Global Ctrl+K / Cmd+K kısayolu
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => {
                    if (!prev) {
                        setQuery('');
                        setSelectedIndex(0);
                    }
                    return !prev;
                });
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return { open, query, setQuery, selectedIndex, setSelectedIndex, openPalette, closePalette };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CommandPalette/useCommandPalette.js
git commit -m "feat(cmd-k): useCommandPalette hook eklendi"
```

---

## Task 4: CommandItem.jsx

**Files:**
- Create: `client/src/components/CommandPalette/CommandItem.jsx`

- [ ] **Step 1: Bileşeni oluştur**

```jsx
// client/src/components/CommandPalette/CommandItem.jsx
import { I } from '@/knozy/icons';
import { A } from '@/knozy/tokens';
import { Cap } from '@/knozy/primitives';

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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CommandPalette/CommandItem.jsx
git commit -m "feat(cmd-k): CommandItem bileşeni eklendi"
```

---

## Task 5: CommandPalette.jsx

**Files:**
- Create: `client/src/components/CommandPalette/CommandPalette.jsx`

- [ ] **Step 1: Ana modal bileşenini oluştur**

```jsx
// client/src/components/CommandPalette/CommandPalette.jsx
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import api from '@/services/api';
import { A } from '@/knozy/tokens';
import { I } from '@/knozy/icons';
import { CommandItem } from './CommandItem';
import { PAGES, ACTIONS, COMMON_FILES } from './commandRegistry';

export function CommandPalette({ open, onClose, query, setQuery, selectedIndex, setSelectedIndex }) {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const debounceRef = useRef(null);

    const [players, setPlayers] = useState([]);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // ACTIONS elemanı | null

    // Açılınca inputu focus'la
    useEffect(() => {
        if (open) {
            setConfirmAction(null);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [open]);

    // Canlı oyuncu araması (300ms debounce)
    useEffect(() => {
        if (!open || !query.trim()) {
            setPlayers([]);
            return;
        }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoadingPlayers(true);
            try {
                const res = await api.get('/players', { params: { search: query } });
                const list = res.data?.players || res.data?.onlinePlayers || [];
                setPlayers(
                    list.slice(0, 5).map(p => ({
                        id: `player-${p.name || p.uuid}`,
                        label: p.name || p.uuid,
                        description: p.uuid ? `UUID: ${p.uuid.slice(0, 8)}…` : 'Oyuncu',
                        icon: 'Users',
                        category: 'Oyuncu',
                        path: `/players`,
                    }))
                );
            } catch {
                setPlayers([]);
            } finally {
                setLoadingPlayers(false);
            }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, open]);

    // Statik öğeleri kategorize et
    const allStatic = [
        ...PAGES.map(p => ({ ...p, category: 'Sayfa' })),
        ...ACTIONS.map(a => ({ ...a, category: 'Eylem' })),
        ...COMMON_FILES.map(f => ({ ...f, category: 'Dosya' })),
    ];

    // Fuzzy search
    const fuse = new Fuse(allStatic, { keys: ['label', 'description'], threshold: 0.4 });
    const staticResults = query.trim()
        ? fuse.search(query).map(r => r.item)
        : allStatic.slice(0, 9);

    const results = [...staticResults, ...players];

    // selectedIndex sınırla
    useEffect(() => {
        setSelectedIndex(i => Math.min(i, Math.max(results.length - 1, 0)));
    }, [results.length, setSelectedIndex]);

    // Seçili öğeyi görünür kıl
    useEffect(() => {
        const el = listRef.current?.children[selectedIndex];
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Öğeyi çalıştır
    const execute = useCallback(async (item) => {
        if (item.category === 'Eylem') {
            const action = ACTIONS.find(a => a.id === item.id);
            if (!action) return;
            if (action.confirm) {
                setConfirmAction(action);
                return;
            }
            try { await api[action.apiMethod](action.apiPath); } catch { /* sunucu yanıtsız */ }
            onClose();
            return;
        }
        navigate(item.path);
        onClose();
    }, [navigate, onClose]);

    // Klavye navigasyonu
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!confirmAction && results[selectedIndex]) execute(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (confirmAction) setConfirmAction(null);
            else onClose();
        }
    }, [results, selectedIndex, execute, onClose, confirmAction, setSelectedIndex]);

    if (!open) return null;

    const content = (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.65)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '15vh',
            }}
            onClick={onClose}
        >
            <style>{`@keyframes knozy-spin { to { transform: rotate(360deg); } }`}</style>

            <div
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{
                    width: '100%', maxWidth: 600, margin: '0 16px',
                    background: A.panel, border: `1px solid ${A.borderHi}`,
                    borderRadius: 6, overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                }}
            >
                {/* ── Arama inputu ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', borderBottom: `1px solid ${A.border}`,
                }}>
                    <I.Search size={15} style={{ color: A.faint, flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        placeholder="Sayfa, eylem veya oyuncu ara…"
                        style={{
                            flex: 1, background: 'transparent', border: 'none',
                            outline: 'none', color: A.text, fontSize: 14,
                            fontFamily: A.sans,
                        }}
                    />
                    {loadingPlayers && (
                        <div style={{
                            width: 13, height: 13, flexShrink: 0,
                            border: `2px solid ${A.border}`, borderTopColor: 'var(--accent)',
                            borderRadius: '50%', animation: 'knozy-spin 0.8s linear infinite',
                        }} />
                    )}
                    <kbd style={{
                        fontSize: 10, color: A.faint, fontFamily: A.mono,
                        background: A.bgDeeper, border: `1px solid ${A.border}`,
                        padding: '2px 6px', borderRadius: 2, flexShrink: 0,
                    }}>ESC</kbd>
                </div>

                {/* ── Onay kutusu (tehlikeli eylemler) ── */}
                {confirmAction && (
                    <div style={{
                        padding: '14px 16px', borderBottom: `1px solid ${A.border}`,
                        background: 'rgba(248,113,113,0.04)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <I.Alert size={14} style={{ color: A.warn }} />
                            <span style={{ fontSize: 13, color: A.text }}>{confirmAction.confirmMsg}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={async () => {
                                    try { await api[confirmAction.apiMethod](confirmAction.apiPath); } catch { /* ignore */ }
                                    setConfirmAction(null);
                                    onClose();
                                }}
                                style={{
                                    background: A.err, border: 'none', color: '#fff',
                                    padding: '6px 16px', borderRadius: 2, cursor: 'pointer',
                                    fontSize: 11, fontFamily: A.mono, fontWeight: 600,
                                    letterSpacing: '0.06em', textTransform: 'uppercase',
                                }}
                            >
                                Onayla
                            </button>
                            <button
                                onClick={() => setConfirmAction(null)}
                                style={{
                                    background: 'transparent', border: `1px solid ${A.border}`,
                                    color: A.dim, padding: '6px 16px', borderRadius: 2, cursor: 'pointer',
                                    fontSize: 11, fontFamily: A.mono, letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Sonuç listesi ── */}
                <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {results.length === 0 ? (
                        <div style={{
                            padding: '32px 16px', textAlign: 'center',
                            color: A.faint, fontSize: 13, fontFamily: A.sans,
                        }}>
                            Sonuç bulunamadı
                        </div>
                    ) : (
                        results.map((item, i) => (
                            <CommandItem
                                key={item.id}
                                item={item}
                                selected={i === selectedIndex && !confirmAction}
                                onMouseEnter={() => setSelectedIndex(i)}
                                onSelect={() => execute(item)}
                            />
                        ))
                    )}
                </div>

                {/* ── Footer kısayol ipuçları ── */}
                <div style={{
                    padding: '8px 16px', borderTop: `1px solid ${A.border}`,
                    display: 'flex', gap: 16,
                }}>
                    {[['↑↓', 'Gezin'], ['↵', 'Seç'], ['ESC', 'Kapat']].map(([key, label]) => (
                        <span key={key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <kbd style={{
                                fontSize: 10, color: A.faint, fontFamily: A.mono,
                                background: A.bgDeeper, border: `1px solid ${A.border}`,
                                padding: '1px 5px', borderRadius: 2,
                            }}>{key}</kbd>
                            <span style={{ fontSize: 10, color: A.faintest }}>{label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CommandPalette/CommandPalette.jsx
git commit -m "feat(cmd-k): CommandPalette ana modal bileşeni eklendi"
```

---

## Task 6: Barrel Export

**Files:**
- Create: `client/src/components/CommandPalette/index.js`

- [ ] **Step 1: index.js oluştur**

```js
// client/src/components/CommandPalette/index.js
export { CommandPalette } from './CommandPalette';
export { useCommandPalette } from './useCommandPalette';
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CommandPalette/index.js
git commit -m "feat(cmd-k): barrel export eklendi"
```

---

## Task 7: App.jsx'e Entegre Et

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Import ekle ve CommandPalette'i render et**

`App.jsx`'te `import` bloğuna şunu ekle:

```js
import { CommandPalette, useCommandPalette } from '@/components/CommandPalette';
```

`function App()` içindeki return'ü şu şekilde güncelle — `<CommandPalette />` satırını `<Toaster />` hemen altına, `<Routes>` bloğunun ÜSTüne ekle:

```jsx
function App() {
  const cmdPalette = useCommandPalette();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <I18nProvider>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#FFFFFF',
                    color: '#111827',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  },
                  success: {
                    iconTheme: { primary: '#16A34A', secondary: '#FFFFFF' },
                  },
                  error: {
                    iconTheme: { primary: '#DC2626', secondary: '#FFFFFF' },
                  },
                }}
              />

              <CommandPalette
                open={cmdPalette.open}
                onClose={cmdPalette.closePalette}
                query={cmdPalette.query}
                setQuery={cmdPalette.setQuery}
                selectedIndex={cmdPalette.selectedIndex}
                setSelectedIndex={cmdPalette.setSelectedIndex}
              />

              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="modpacks" element={<ModpacksPage />} />
                  <Route path="mods" element={<ModsPage />} />
                  <Route path="console" element={<ConsolePage />} />
                  <Route path="files" element={<FilesPage />} />
                  <Route path="worlds" element={<WorldsPage />} />
                  <Route path="scheduler" element={<SchedulerPage />} />
                  <Route path="terminal" element={<TerminalPage />} />
                  <Route path="backup" element={<BackupPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="discord" element={<DiscordPage />} />
                  <Route path="automation" element={<AutomationPage />} />
                  <Route path="performance" element={<PerformancePage />} />
                  <Route path="players" element={<PlayersPage />} />
                  <Route path="servers" element={<ServersPage />} />
                </Route>
                <Route path="/server" element={<Navigate to="/" replace />} />
                <Route path="/logs" element={<Navigate to="/console" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </I18nProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Uygulamayı başlat ve manuel test et**

```bash
cd client && npm run dev
```

Tarayıcıda `http://localhost:5173` aç, `Ctrl+K` bas:
- ✅ Koyu overlay açılıyor
- ✅ Input focus'lu, placeholder görünüyor
- ✅ Sayfa listesi geliyor
- ✅ `↑↓` ile geziniliyor, seçili satır vurgulu
- ✅ `Enter` ile sayfaya gidiliyor, palette kapanıyor
- ✅ `Esc` ile kapanıyor
- ✅ "Sunucuyu Yeniden Başlat" seçince onay kutusu çıkıyor

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(cmd-k): CMD+K komut paleti App.jsx'e entegre edildi"
```

---

## Task 8: Son Push ve PR

- [ ] **Step 1: Branch'i push et**

```bash
git push origin HEAD
```

- [ ] **Step 2: PR aç (isteğe bağlı)**

```bash
gh pr create --title "feat: CMD+K komut paleti" --body "Ctrl+K ile açılan global komut paleti. Sayfa navigasyonu, sunucu eylemleri, oyuncu araması ve dosya erişimi desteklenir."
```
