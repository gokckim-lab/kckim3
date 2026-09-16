import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmTossPayment } from '../lib/wallet';

type State = { status: 'confirming' } | { status: 'done'; balance: number | null } | { status: 'error'; message: string };

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'confirming' });

  useEffect(() => {
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = Number(params.get('amount'));
    if (!paymentKey || !orderId || !amount) {
      setState({ status: 'error', message: '결제 정보가 올바르지 않습니다.' });
      return;
    }
    confirmTossPayment(paymentKey, orderId, amount)
      .then((res) => setState({ status: 'done', balance: res.balance }))
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm text-center">
        {state.status === 'confirming' && <p className="text-slate-600">결제 승인 확인 중...</p>}
        {state.status === 'done' && (
          <>
            <div className="text-3xl mb-2">✅</div>
            <p className="text-slate-800 font-semibold mb-1">충전이 완료되었습니다</p>
            {state.balance !== null && (
              <p className="text-sm text-slate-500 mb-4">현재 잔액: {state.balance.toLocaleString('ko-KR')} P</p>
            )}
            <Link to="/wallet" className="inline-block bg-slate-900 text-white px-4 py-2 rounded-md text-sm">포인트 지갑으로 이동</Link>
          </>
        )}
        {state.status === 'error' && (
          <>
            <div className="text-3xl mb-2">⚠️</div>
            <p className="text-rose-600 font-semibold mb-1">결제 확인에 실패했습니다</p>
            <p className="text-sm text-slate-500 mb-4">{state.message}</p>
            <Link to="/wallet" className="inline-block bg-slate-900 text-white px-4 py-2 rounded-md text-sm">포인트 지갑으로 이동</Link>
          </>
        )}
      </div>
    </div>
  );
}
