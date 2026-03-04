import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
    HiOutlineHome,
    HiOutlineServer,
    HiOutlinePuzzlePiece,
    HiOutlineCommandLine,
    HiOutlineCog6Tooth,
    HiOutlineArchiveBox,
    HiOutlineDocumentText,
} from 'react-icons/hi2';

const navItems = [
    { path: '/', label: 'Dashboard', icon: HiOutlineHome },
    { path: '/server', label: 'Sunucu', icon: HiOutlineServer },
    { path: '/modpacks', label: 'Modpackler', icon: HiOutlinePuzzlePiece },
    { path: '/console', label: 'Konsol', icon: HiOutlineCommandLine },
    { path: '/settings', label: 'Ayarlar', icon: HiOutlineCog6Tooth },
    { path: '/backup', label: 'Yedekleme', icon: HiOutlineArchiveBox },
    { path: '/logs', label: 'Loglar', icon: HiOutlineDocumentText },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user } = useAuth();

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className={`
          fixed top-0 left-0 h-full z-50 w-64
          bg-white border-r border-gray-200
          flex flex-col
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
            >
                {/* Logo */}
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-xl shadow-sm object-cover" />
                        <div>
                            <h1 className="text-lg font-bold text-gray-900 tracking-tight">Sunucu Paneli</h1>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 overflow-y-auto">
                    <ul className="space-y-1">
                        {navItems.map((item) => (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    onClick={onClose}
                                    className={({ isActive }) => `
                    flex items-center gap-3 px-4 py-3 rounded-xl
                    text-sm font-medium transition-all duration-200
                    ${isActive
                                            ? 'bg-gray-900 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                        }
                  `}
                                    end={item.path === '/'}
                                >
                                    <item.icon className="w-5 h-5 flex-shrink-0" />
                                    <span>{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* User section - no logout button */}
                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white text-sm font-bold">
                            {user?.username?.[0]?.toUpperCase() || 'K'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{user?.username || 'Knozy'}</p>
                            <p className="text-xs text-gray-400">Yönetici</p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
