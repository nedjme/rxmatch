import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoginPage from '@/pages/auth/LoginPage';
import ShellLayout from '@/components/layout/ShellLayout';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PrescriptionsPage from '@/pages/dashboard/PrescriptionsPage';
import NewPrescriptionPage from '@/pages/dashboard/NewPrescriptionPage';
import PrescriptionDetailPage from '@/pages/dashboard/PrescriptionDetailPage';
import CataloguePage from '@/pages/dashboard/CataloguePage';
import SettingsPage from '@/pages/dashboard/SettingsPage';
import AdminPage from '@/pages/admin/AdminPage';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || user.email !== ADMIN_EMAIL) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin panel */}
      <Route path="/admin/*" element={
        <RequireAdmin><AdminPage /></RequireAdmin>
      } />

      {/* Main app shell */}
      <Route path="/*" element={
        <RequireAuth>
          <ShellLayout>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="prescriptions" element={<PrescriptionsPage />} />
              <Route path="prescriptions/nouvelle" element={<NewPrescriptionPage />} />
              <Route path="prescriptions/:id" element={<PrescriptionDetailPage />} />
              <Route path="catalogue" element={<CataloguePage />} />
              <Route path="parametres" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ShellLayout>
        </RequireAuth>
      } />
    </Routes>
  );
}
