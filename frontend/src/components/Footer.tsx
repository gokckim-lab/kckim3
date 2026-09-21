import { Link } from 'react-router-dom';
import { OPERATOR } from './LegalLayout';

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white print:hidden">
      <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-slate-500 space-y-1">
        <div className="flex gap-4 font-medium text-slate-600">
          <Link to="/terms" className="hover:underline">이용약관</Link>
          <Link to="/privacy" className="hover:underline">개인정보처리방침</Link>
        </div>
        <p>{OPERATOR.company} · 대표 {OPERATOR.ceo} · 사업자등록번호 {OPERATOR.bizNo}</p>
        <p>{OPERATOR.address} · 문의 {OPERATOR.email}</p>
      </div>
    </footer>
  );
}
