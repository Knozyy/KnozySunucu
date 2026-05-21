import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { HiOutlineBars3, HiOutlineArrowPath } from 'react-icons/hi2';

function useUpdateBanner() {
    const [showBanner, setShowBanner] = useState(false);
    const knownStartTime = useRef(null);
    const wasOffline = useRef(false);

    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('/api/health');
                if (!res.ok) throw new Error('not ok');
                const data = await res.json();

                if (knownStartTime.current === null) {
                    // İlk yükleme — mevcut startTime'ı kaydet
                    knownStartTime.current = data.startTime;
                } else if (data.startTime !== knownStartTime.current) {
                    // startTime değişti = sunucu yeniden başladı
                    setShowBanner(true);
                } else if (wasOffline.current) {
                    // Çevrimdışıydı, geri geldi ama startTime aynı
                    setShowBanner(true);
                }
                wasOffline.current = false;
            } catch {
                wasOffline.current = true;
            }
        };

        check();
        const id = setInterval(check, 30000);
        return () => clearInterval(id);
    }, []);

    return showBanner;
}

export default function MainLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const showBanner = useUpdateBanner();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0F172A]">
            {showBanner && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <HiOutlineArrowPath className="w-4 h-4 animate-spin" />
                        <span>Panel güncellendi veya sunucu yeniden başladı. Sayfayı yenileyiniz.</span>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-1.5 bg-white text-indigo-600 text-sm font-semibold px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                        <HiOutlineArrowPath className="w-4 h-4" />
                        Yenile
                    </button>
                </div>
            )}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main content */}
            <div className="lg:ml-64 min-h-screen">
                {/* Mobile header */}
                <header className="lg:hidden sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <HiOutlineBars3 className="w-6 h-6" />
                        </button>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Sunucu Paneli</h1>
                    </div>
                </header>

                {/* Page content */}
                <main className="p-4 md:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
