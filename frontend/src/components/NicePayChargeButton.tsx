import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { requestNicePayCharge } from '../lib/nicepay';

export default function NicePayChargeButton({ amount }: { amount: number }) {
  const { user } = useAuth();
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await requestNicePayCharge(amount, user.id, (message) => {
        notify(message, 'error');
        setBusy(false);
      });
      // 정상 흐름이면 나이스페이 결제창으로 이동하면서 이 페이지를 벗어난다.
    } catch (e: any) {
      notify(e.message, 'error');
      setBusy(false);
    }
  };

  return (
    <button onClick={pay} disabled={busy}
      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
      {busy ? '결제창 여는 중...' : `${amount.toLocaleString('ko-KR')}원 카드결제`}
    </button>
  );
}
