import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineHome, HiOutlinePuzzlePiece,
    HiOutlineCommandLine, HiOutlineCog6Tooth, HiOutlineArchiveBox,
    HiOutlineFolder, HiOutlineCube, HiOutlineGlobeAlt, HiOutlineClock,
    HiOutlineSun, HiOutlineMoon, HiOutlineLanguage, HiOutlineArrowRightOnRectangle,
    HiOutlineChatBubbleLeftRight, HiOutlineChevronDown, HiOutlineBolt, HiOutlineBoltSlash, HiOutlineChartBar, HiOutlineUsers,
    HiOutlineArrowPath, HiOutlineServerStack,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';

// permKey: admin her zaman görür, user kategorisine göre görür
// adminOnly: sadece admin görür
const navGroups = [
    {
        id: 'general',
        items: [
            { path: '/', i18nKey: 'nav.dashboard', icon: HiOutlineHome },
        ],
    },
    {
        id: 'server',
        label: 'Sunucu',
        items: [
            { path: '/console', i18nKey: 'nav.console', icon: HiOutlineCommandLine, permKey: 'console' },
            { path: '/terminal', label: 'Terminal', icon: HiOutlineCommandLine, permKey: 'terminal' },
            { path: '/performance', label: 'Performans', icon: HiOutlineChartBar, permKey: 'console' },
            { path: '/players', label: 'Oyuncular', icon: HiOutlineUsers, permKey: 'console' },
        ],
    },
    {
        id: 'content',
        label: 'İçerik',
        items: [
            { path: '/worlds', i18nKey: 'nav.worlds', icon: HiOutlineGlobeAlt, permKey: 'worlds' },
            { path: '/files', i18nKey: 'nav.files', icon: HiOutlineFolder, permKey: 'files' },
            { path: '/modpacks', i18nKey: 'nav.modpacks', icon: HiOutlinePuzzlePiece, permKey: 'modpacks' },
            { path: '/mods', i18nKey: 'nav.mods', icon: HiOutlineCube, permKey: 'mods' },
        ],
    },
    {
        id: 'automation',
        label: 'Otomasyon',
        items: [
            { path: '/scheduler', i18nKey: 'nav.scheduler', icon: HiOutlineClock, permKey: 'scheduler' },
            { path: '/backup', i18nKey: 'nav.backup', icon: HiOutlineArchiveBox, permKey: 'backup' },
            { path: '/automation', label: 'Otomasyon', icon: HiOutlineBolt, permKey: 'scheduler' },
            { path: '/lag-guard', label: 'Lag-Guard', icon: HiOutlineBoltSlash, permKey: 'console' },
        ],
    },
    {
        id: 'integration',
        label: 'Entegrasyon',
        items: [
            { path: '/discord', label: 'Discord Bot', icon: HiOutlineChatBubbleLeftRight, permKey: 'discord' },
        ],
    },
    {
        id: 'system',
        label: 'Sistem',
        items: [
            { path: '/servers',  label: 'Sunucular', icon: HiOutlineServerStack, adminOnly: true },
            { path: '/settings', i18nKey: 'nav.settings', icon: HiOutlineCog6Tooth, adminOnly: true },
        ],
    },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user, activateGoldenKey, logout, canAccess } = useAuth();
    const { isDark, toggle } = useTheme();
    const { locale, changeLocale, t } = useI18n();

    // Varsayılan olarak tüm gruplar açık
    const [collapsed, setCollapsed] = useState(new Set());

    const toggleGroup = (id) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleGoldenKey = async () => {
        if (user?.role === 'admin') return;
        const username = window.prompt("SuperAdmin Kullanıcı Adını Girin:");
        if (!username) return;
        const password = window.prompt("SuperAdmin Gizli Parolasını Girin:");
        if (password) {
            try {
                const msg = await activateGoldenKey(username, password);
                toast.success(msg || 'Yetki seviyeniz Admin olarak güncellendi! 🎉');
            } catch (err) {
                toast.error(err.response?.data?.error || 'Geçersiz bilgiler!');
            }
        }
    };

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={onClose} />
            )}

            <aside
                className={`
                    fixed top-0 left-0 h-full z-50 w-64
                    bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
                    flex flex-col transition-transform duration-300 ease-in-out
                    lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* Logo */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-xl shadow-sm object-cover" />
                        <div>
                            <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Sunucu Paneli</h1>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-1">
                    {navGroups.map((group) => {
                        // Gruptaki görünür öğeleri filtrele
                        const visibleItems = group.items.filter(item => {
                            if (item.adminOnly && user?.role !== 'admin') return false;
                            if (item.permKey && !canAccess(item.permKey)) return false;
                            return true;
                        });

                        // Görünür öğe yoksa grubu hiç gösterme
                        if (visibleItems.length === 0) return null;

                        const isCollapsed = collapsed.has(group.id);

                        return (
                            <div key={group.id}>
                                {/* Grup başlığı (sadece label olan gruplarda) */}
                                {group.label && (
                                    <button
                                        onClick={() => toggleGroup(group.id)}
                                        className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-lg group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                    >
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">
                                            {group.label}
                                        </span>
                                        <HiOutlineChevronDown
                                            className={`w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                        />
                                    </button>
                                )}

                                {/* Öğeler */}
                                <ul
                                    className="space-y-0.5 overflow-hidden transition-all duration-200"
                                    style={{ maxHeight: isCollapsed ? '0px' : '400px', opacity: isCollapsed ? 0 : 1 }}
                                >
                                    {visibleItems.map((item) => (
                                        <li key={item.path}>
                                            <NavLink
                                                to={item.path}
                                                onClick={onClose}
                                                className={({ isActive }) => `
                                                    flex items-center gap-3 px-4 py-2.5 rounded-xl
                                                    text-sm font-medium transition-all duration-200
                                                    ${isActive
                                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                                                    }
                                                `}
                                                end={item.path === '/'}
                                            >
                                                <item.icon className="w-5 h-5 flex-shrink-0" />
                                                <span>{item.label || t(item.i18nKey)}</span>
                                            </NavLink>
                                        </li>
                                    ))}
                                </ul>

                                {/* Grup arası ince ayraç (son grup hariç, label olan grupların altına) */}
                                {group.label && !isCollapsed && (
                                    <div className="mt-1 mb-0.5" />
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Theme Toggle + User */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
                    <button
                        onClick={toggle}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        {isDark ? <HiOutlineSun className="w-5 h-5" /> : <HiOutlineMoon className="w-5 h-5" />}
                        {isDark ? t('common.lightTheme') : t('common.darkTheme')}
                    </button>
                    <button
                        onClick={() => changeLocale(locale === 'tr' ? 'en' : 'tr')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <HiOutlineLanguage className="w-5 h-5" />
                        {locale === 'tr' ? 'English' : 'Türkçe'}
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <HiOutlineArrowPath className="w-5 h-5" />
                        Sayfayı Yenile
                    </button>
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors group">
                        <div
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                            onDoubleClick={handleGoldenKey}
                            title={user?.role !== 'admin' ? "Gizli yetkilendirme için çift tıklayın" : "Yetkili Kullanıcı"}
                        >
                            <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm ${user?.role === 'admin' ? 'bg-amber-400 text-amber-950' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'}`}>
                                {user?.username?.[0]?.toUpperCase() || 'K'}
                            </div>
                            <div className="flex-1 min-w-0 truncate">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.username || 'Knozy'}</p>
                                <p className={`text-xs ${user?.role === 'admin' ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-gray-400'}`}>
                                    {user?.role === 'admin' ? 'SuperAdmin' : 'Misafir'}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={logout}
                            title={t('common.logout') || "Çıkış Yap"}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors focus:outline-none"
                        >
                            <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
