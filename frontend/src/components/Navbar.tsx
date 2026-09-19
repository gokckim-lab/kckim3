import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LINKS = [
  { to: '/documents/quote', label: '견적서' },
  { to: '/documents/order', label: '주문서' },
  { to: '/documents/delivery', label: '거래명세서' },
  { to: '/documents/tax_invoice', label: '세금계산서' },
  { to: '/customers', label: '거래처' },
  { to: '/products', label: '품목' },
  { to: '/wallet', label: '포인트' },
  { to: '/profile', label: '회사정보' },
  { to: '/contact', label: '문의하기' },
];

export default function Navbar() {
  const { signOut, user, isAdmin } = useAuth();
  const links = isAdmin
    ? [
        ...LINKS,
        { to: '/admin/deposits', label: '입금승인(관리자)' },
        { to: '/admin/refunds', label: '환불승인(관리자)' },
        { to: '/admin/users', label: '전체 가입자(관리자)' },
      ]
    : LINKS;

  return (
    <nav className="bg-slate-900 text-white print:hidden">
      <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-1 overflow-x-auto">
        <span className="font-bold text-lg mr-4 shrink-0">🐦 Birdie Bill</span>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm whitespace-nowrap shrink-0 ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-300 shrink-0">
          <span className="text-xs whitespace-nowrap">{user?.email}</span>
          <button onClick={signOut} className="px-3 py-1.5 rounded-md hover:bg-slate-800 whitespace-nowrap">로그아웃</button>
        </div>
      </div>
    </nav>
  );
}
