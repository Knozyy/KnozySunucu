import { createContext, useContext, useState, useEffect } from 'react';
import api from '@/services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('knozy_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const response = await api.get('/auth/me');
                setUser(response.data.user);
            } catch {
                localStorage.removeItem('knozy_token');
                localStorage.removeItem('knozy_user');
                setToken(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const login = async (username, password) => {
        const response = await api.post('/auth/login', { username, password });
        const { token: newToken, user: userData } = response.data;

        localStorage.setItem('knozy_token', newToken);
        localStorage.setItem('knozy_user', JSON.stringify(userData));
        setToken(newToken);
        setUser(userData);

        return userData;
    };

    const register = async (username, password) => {
        await api.post('/auth/register', { username, password });
    };

    const logout = () => {
        localStorage.removeItem('knozy_token');
        localStorage.removeItem('knozy_user');
        setToken(null);
        setUser(null);
    };

    const checkAdmin = async () => {
        const response = await api.get('/auth/check');
        return response.data.hasAdmin;
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout, checkAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
