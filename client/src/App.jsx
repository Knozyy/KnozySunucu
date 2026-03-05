import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { I18nProvider } from '@/context/I18nContext';

import MainLayout from '@/components/layout/MainLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ModpacksPage from '@/pages/ModpacksPage';
import ConsolePage from '@/pages/ConsolePage';
import SettingsPage from '@/pages/SettingsPage';
import BackupPage from '@/pages/BackupPage';
import FilesPage from '@/pages/FilesPage';
import ModsPage from '@/pages/ModsPage';
import WorldsPage from '@/pages/WorldsPage';
import SchedulerPage from '@/pages/SchedulerPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
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
                  <Route path="backup" element={<BackupPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                {/* Eski URL'ler → yenilere yönlendir */}
                <Route path="/server" element={<Navigate to="/" replace />} />
                <Route path="/players" element={<Navigate to="/settings" replace />} />
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

export default App;
