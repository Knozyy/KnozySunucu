import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import {
    HiOutlineHome, HiOutlinePuzzlePiece,
    HiOutlineCommandLine, HiOutlineCog6Tooth, HiOutlineArchiveBox,
    HiOutlineFolder, HiOutlineCube, HiOutlineGlobeAlt, HiOutlineClock,
    HiOutlineSun, HiOutlineMoon, HiOutlineLanguage,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';

const navItems = [
    { path: '/', i18nKey: 'nav.dashboard', icon: HiOutlineHome },
    { path: '/console', i18nKey: 'nav.console', icon: HiOutlineCommandLine },
    { path: '/worlds', i18nKey: 'nav.worlds', icon: HiOutlineGlobeAlt },
    { path: '/files', i18nKey: 'nav.files', icon: HiOutlineFolder, adminOnly: true },
    { path: '/modpacks', i18nKey: 'nav.modpacks', icon: HiOutlinePuzzlePiece, adminOnly: true },
    { path: '/mods', i18nKey: 'nav.mods', icon: HiOutlineCube, adminOnly: true },
    { path: '/scheduler', i18nKey: 'nav.scheduler', icon: HiOutlineClock, adminOnly: true },
    { path: '/backup', i18nKey: 'nav.backup', icon: HiOutlineArchiveBox, adminOnly: true },
    { path: '/settings', i18nKey: 'nav.settings', icon: HiOutlineCog6Tooth, adminOnly: true },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user, activateGoldenKey } = useAuth();
    const { isDark, toggle } = useTheme();
    const { locale, changeLocale, t } = useI18n();

    const handleGoldenKey = async () => {
        if (user?.role === 'admin') return;
        const key = window.prompt("SuperAdmin Gizli Anahtarını Girin:");
        if (key) {
            try {
                const msg = await activateGoldenKey(key);
                toast.success(msg || 'Yetki seviyeniz Admin olarak güncellendi! 🎉');
            } catch (err) {
                toast.error(err.response?.data?.error || 'Geçersiz altın anahtar!');
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
                <nav className="flex-1 py-4 px-3 overflow-y-auto">
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            if (item.adminOnly && user?.role !== 'admin') return null;

                            return (
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
                                        <span>{t(item.i18nKey)}</span>
                                    </NavLink>
                                </li>
                            );
                        })}
                    </ul>
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
                    <div
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
                        onDoubleClick={handleGoldenKey}
                        title={user?.role !== 'admin' ? "Gizli yetkilendirme için çift tıklayın" : "Yetkili Kullanıcı"}
                    >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm ${user?.role === 'admin' ? 'bg-amber-400 text-amber-950' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'}`}>
                            {user?.username?.[0]?.toUpperCase() || 'K'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.username || 'Knozy'}</p>
                            <p className={`text-xs ${user?.role === 'admin' ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-gray-400'}`}>
                                {user?.role === 'admin' ? 'SuperAdmin' : 'Misafir'}
                            </p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
