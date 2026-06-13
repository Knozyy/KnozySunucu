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
    { id: 'page-performance', label: 'Performans',   description: 'CPU / RAM izleme',        path: '/performance', icon: 'Signal'    },
    { id: 'page-lagguard',    label: 'Lag Koruması', description: 'TPS/MSPT izleme & throttle', path: '/lag-guard', icon: 'Signal'    },
    { id: 'page-vip',         label: 'VIP',          description: 'VIP paket & üyelik yönetimi', path: '/vip',     icon: 'Crown'     },
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
    { id: 'file-whitelist',    label: 'whitelist.json',    description: 'Whitelist listesi',         path: '/files', icon: 'Folder' },
    { id: 'file-eula',         label: 'eula.txt',          description: 'EULA dosyası',              path: '/files', icon: 'Folder' },
];
