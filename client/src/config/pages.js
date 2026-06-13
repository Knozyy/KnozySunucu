// client/src/config/pages.js
// ─────────────────────────────────────────────────────────────────────────────
// TEK KAYNAK: sayfa listesi hem menüde (MainLayout) hem izin UI'ında (SettingsPage)
// buradan gelir. Yeni bir sayfa eklerken SADECE buraya bir satır ekle → menüde de,
// izin kategorilerinde de otomatik görünür (artık iki yeri elle güncellemek yok).
//
// key      : izin anahtarı (kategorinin pages[] dizisinde saklanır, canAccess bununla bakar)
// path     : rota
// always   : herkese açık (izinden bağımsız — ör. ana panel)
// adminOnly: yalnızca admin (kategoriye atanamaz; non-admin asla göremez)
import { I } from '@/hoodoo/icons';

export const PAGES = [
    { key: 'dashboard',   path: '/',           label: 'Dashboard',    emoji: '🏠', icon: I.Dashboard, always: true },
    { key: 'console',     path: '/console',    label: 'Konsol',       emoji: '💻', icon: I.Console, badge: 'LIVE' },
    { key: 'players',     path: '/players',    label: 'Oyuncular',    emoji: '👥', icon: I.Users },
    { key: 'performance', path: '/performance',label: 'Performans',   emoji: '📊', icon: I.CPU },
    { key: 'worlds',      path: '/worlds',     label: 'Dünyalar',     emoji: '🌍', icon: I.World },
    { key: 'files',       path: '/files',      label: 'Dosyalar',     emoji: '📁', icon: I.Folder },
    { key: 'modpacks',    path: '/modpacks',   label: 'Modpackler',   emoji: '📦', icon: I.Cube },
    { key: 'mods',        path: '/mods',       label: 'Modlar',       emoji: '🧩', icon: I.Stack },
    { key: 'scheduler',   path: '/scheduler',  label: 'Zamanlayıcı',  emoji: '⏰', icon: I.Clock },
    { key: 'backup',      path: '/backup',     label: 'Yedek',        emoji: '💾', icon: I.Archive },
    { key: 'discord',     path: '/discord',    label: 'Discord Bot',  emoji: '🎮', icon: I.Chat },
    { key: 'lagguard',    path: '/lag-guard',  label: 'Lag Koruması', emoji: '🛡️', icon: I.Signal },
    { key: 'vip',         path: '/vip',        label: 'VIP',          emoji: '👑', icon: I.Crown, adminOnly: true },
    { key: 'terminal',    path: '/terminal',   label: 'Terminal',     emoji: '⌨️', icon: I.Terminal, adminOnly: true },
    { key: 'servers',     path: '/servers',    label: 'Sunucular',    emoji: '🖥️', icon: I.Server, adminOnly: true },
    { key: 'settings',    path: '/settings',   label: 'Ayarlar',      emoji: '⚙️', icon: I.Cog, adminOnly: true },
];

// Eylem izinleri (sayfa DEĞİL) — kategoriye atanır, aynı pages[] dizisinde saklanır.
// canAccess(key) ile kontrol edilir; sunucu tarafı (wsRouter) da aynı anahtara bakar.
export const PERMISSIONS = [
    { key: 'console_command', label: 'Konsol Komut Yazma', emoji: '⌨️',
      desc: 'Konsola komut gönderebilir (ayrıca Konsol sayfası erişimi gerekir).' },
];

// İzin kategorilerine ATANABİLİR sayfalar (admin-only ve always sayfalar hariç).
export const ASSIGNABLE = PAGES.filter(p => !p.adminOnly && !p.always);

// key → tanım (etiket/emoji çözümü için)
export const PAGE_BY_KEY = Object.fromEntries([...PAGES, ...PERMISSIONS].map(p => [p.key, p]));
