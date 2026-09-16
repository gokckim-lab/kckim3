import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentFail() {
  const [params] = useSearchParams();
  const message = params.get('message') || '결제가 취소되었거나 실패했습니다.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm text-center">
        <div className="text-3xl mb-2">✕</div>
        <p className="text-slate-800 font-semibold mb-1">결제가 완료되지 않았습니다</p>
        <p className="text-sm text-slate-500 mb-4">{message}</p>
        <Link to="/wallet" className="inline-block bg-slate-900 text-white px-4 py-2 rounded-md text-sm">포인트 지갑으로 이동</Link>
      </div>
    </div>
  );
}
