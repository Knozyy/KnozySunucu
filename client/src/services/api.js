import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('knozy_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error.config?.url || '';
        // Login/register isteğinde 401 "yanlış kullanıcı adı/şifre" demektir —
        // oturum süresinin dolması değil. Bu durumda yönlendirme yapma, yoksa sayfa
        // yeniden yüklenip formdaki hata mesajı silinir. Çağıran bileşen göstersin.
        const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register');
        if (error.response?.status === 401 && !isAuthAttempt) {
            localStorage.removeItem('knozy_token');
            localStorage.removeItem('knozy_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
