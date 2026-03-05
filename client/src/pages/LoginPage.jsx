import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';


export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [isSetupMode, setIsSetupMode] = useState(false);

    const { login, register, checkAdmin, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            navigate('/');
            return;
        }

        const verifyDb = async () => {
            try {
                const hasAdmin = await checkAdmin();
                setIsSetupMode(!hasAdmin); // Admin yoksa setup modunu aç
            } catch (err) {
                console.error("DB kontrol hatası:", err);
            } finally {
                setCheckingAuth(false);
            }
        };

        verifyDb();
    }, [user, navigate, checkAdmin]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSetupMode) {
                // Kayıt ol
                await register(username, password);
                // Kayıt sonrası otomatik giriş yap
                await login(username, password);
                navigate('/');
            } else {
                // Giriş yap
                await login(username, password);
                navigate('/');
            }
        } catch (err) {
            setError(err.response?.data?.error || (isSetupMode ? 'Kayıt başarısız' : 'Giriş başarısız'));
        } finally {
            setLoading(false);
        }
    };

    if (checkingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
            <div className="relative w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8 fade-in">
                    <img src="/logo.png" alt="Logo" className="w-20 h-20 rounded-2xl shadow-lg mb-4 mx-auto object-cover" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Sunucu Paneli</h1>
                    <p className="text-gray-500">Minecraft Sunucu Yönetim Paneli</p>
                </div>

                {/* Login/Setup form */}
                <div className="glass-card p-8 fade-in" style={{ animationDelay: '0.1s' }}>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                        {isSetupMode ? 'İlk Kurulum: Admin Hesabı Oluştur' : 'Giriş Yap'}
                    </h2>
                    {isSetupMode && (
                        <p className="text-sm text-gray-500 mb-6">Sisteme erişim için ilk yönetici hesabını oluşturun.</p>
                    )}
                    {!isSetupMode && <div className="mb-6"></div>}

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                                Kullanıcı Adı
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="input-field"
                                placeholder="admin"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                Şifre
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-field"
                                placeholder="••••••••"
                                required
                                minLength={5}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full justify-center py-3 text-base mt-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                isSetupMode ? 'Hesap Oluştur ve Başla' : 'Giriş Yap'
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-gray-400 text-sm mt-6">
                    {isSetupMode ? 'Bu hesap tüm panel yetkilerine sahip olacaktır.' : 'Panel erişimi yetkilendirilmiş kullanıcılara açıktır.'}
                </p>
            </div>
        </div>
    );
}
