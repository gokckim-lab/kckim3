import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
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
import Contact from './pages/Contact';

function Shell() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      {user && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/documents/quote" replace />} />
        <Route path="/profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
        <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
        <Route path="/admin/deposits" element={<ProtectedRoute><AdminDeposits /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/documents/:type" element={<ProtectedRoute><DocumentList /></ProtectedRoute>} />
        <Route path="/documents/:type/:id" element={<ProtectedRoute><DocumentEditor /></ProtectedRoute>} />
      </Routes>
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
