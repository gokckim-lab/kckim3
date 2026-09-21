import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { migrateGuestData } from './lib/docStore';
import { hasGuestData } from './lib/guestStore';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import CompanyProfile from './pages/CompanyProfile';
import Customers from './pages/Customers';
import Products from './pages/Products';
import DocumentList from './pages/DocumentList';
import DocumentEditor from './pages/DocumentEditor';
import Wallet from './pages/Wallet';
import AdminDeposits from './pages/AdminDeposits';
import AdminUsers from './pages/AdminUsers';
import AdminRefunds from './pages/AdminRefunds';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Footer from './components/Footer';

function Shell() {
  const { user, loading } = useAuth();
  const notify = useToast();
  const { pathname } = useLocation();
  const [migratedFor, setMigratedFor] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const migrating = !!userId && migratedFor !== userId;

  // 체험 모드로 작성해둔 문서가 있으면, 로그인/가입 직후 계정으로 옮긴다.
  // 옮기는 동안 화면을 가려서, 목록이 옮겨지기 전의 빈 상태로 먼저 그려지지 않게 한다.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    migrateGuestData(userId)
      .then((count) => { if (count > 0 && !cancelled) notify(`체험 중 작성한 문서 ${count}건을 내 계정으로 옮겼습니다.`, 'success'); })
      .catch((e) => notify(`체험 문서를 옮기지 못했습니다: ${e.message}`, 'error'))
      .finally(() => { if (!cancelled) setMigratedFor(userId); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || migrating) {
    return <div className="min-h-screen bg-slate-50 p-10 text-center text-slate-400">{migrating && hasGuestData() ? '작성하던 문서를 내 계정으로 옮기는 중...' : '불러오는 중...'}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {pathname !== '/login' && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/" element={<Navigate to="/documents/quote" replace />} />
        <Route path="/profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
        <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
        <Route path="/admin/deposits" element={<ProtectedRoute><AdminDeposits /></ProtectedRoute>} />
        <Route path="/admin/refunds" element={<ProtectedRoute><AdminRefunds /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/documents/:type" element={<DocumentList />} />
        <Route path="/documents/:type/:id" element={<DocumentEditor />} />
      </Routes>
      {pathname !== '/login' && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
