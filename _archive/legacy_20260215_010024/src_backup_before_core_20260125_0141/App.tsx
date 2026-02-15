import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { Register } from './pages/Register';
import { PendingApproval } from './pages/PendingApproval';
import { DashboardPlaceholder } from "./components/DashboardPlaceholder";

const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireAdmin && user?.role !== 'ADMIN') return <Navigate to="/app" replace />;
  return <>{children}</>;
};

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminView = location.pathname.startsWith('/admin');

  return (
    <>
      {user?.role === 'ADMIN' && (
          <div className="bg-red-950/30 border-b border-red-900/30 p-2 sticky top-0 z-50 backdrop-blur-sm">
              <div className="flex justify-center gap-4">
                  <button onClick={() => navigate('/app')} className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${!isAdminView ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : 'text-red-400 hover:bg-red-900/40'}`}>
                      🎬 App de Vídeo
                  </button>
                  <button onClick={() => navigate('/admin')} className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${isAdminView ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : 'text-red-400 hover:bg-red-900/40'}`}>
                      🛡️ Painel Admin
                  </button>
              </div>
          </div>
      )}

      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pending" element={<PendingApproval />} />
<Route path="/app" element={<ProtectedRoute><DashboardPlaceholder /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/app" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AppRoutes />;
}
