import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function GuestBanner() {
  const { user } = useAuth();
  if (user) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <p className="text-sm text-amber-900">
        <b>가입 없이 체험 중</b> · 작성한 문서는 이 브라우저에만 저장됩니다(브라우저 기록을 지우면 사라져요).
        가입하면 안전하게 보관되고, 거래처·품목 관리와 전자세금계산서 발행을 쓸 수 있습니다.
      </p>
      <div className="shrink-0 flex items-center gap-2">
        <Link to="/login" className="text-sm px-3 py-1.5 rounded-md border border-amber-300 text-amber-900 hover:bg-amber-100">
          로그인
        </Link>
        <Link to="/login?mode=signup" className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800">
          회원가입
        </Link>
      </div>
    </div>
  );
}
