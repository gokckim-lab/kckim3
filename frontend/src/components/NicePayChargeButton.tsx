import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { requestNicePayCharge, requestNicePayBankTransfer, type BuyerInfo } from '../lib/nicepay';

interface Props {
  amount: number;
  buyer?: BuyerInfo;
  method?: 'card' | 'bank';
  // 계좌이체는 카드전표가 없어 세금계산서로 증빙해야 하므로, 버튼을 누르기 전에
  // 회사정보(사업자등록번호/이메일) 확인 안내를 띄우고 싶을 때 넘긴다. false를 반환하면 결제를 취소한다.
  onBeforePay?: () => boolean;
}

const REQUEST_FN = { card: requestNicePayCharge, bank: requestNicePayBankTransfer };
const LABEL = { card: '카드결제', bank: '계좌이체' };
const STYLE = { card: 'bg-blue-600 hover:bg-blue-700', bank: 'bg-indigo-600 hover:bg-indigo-700' };

export default function NicePayChargeButton({ amount, buyer, method = 'card', onBeforePay }: Props) {
  const { user } = useAuth();
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!user) return;
    if (onBeforePay && !onBeforePay()) return;
    setBusy(true);
    try {
      await REQUEST_FN[method](amount, user.id, (message) => {
        notify(message, 'error');
        setBusy(false);
      }, buyer);
      // 정상 흐름이면 나이스페이 결제창으로 이동하면서 이 페이지를 벗어난다.
    } catch (e: any) {
      notify(e.message, 'error');
      setBusy(false);
    }
  };

  return (
    <button onClick={pay} disabled={busy}
      className={`text-white px-4 py-2 rounded-md text-sm disabled:opacity-60 ${STYLE[method]}`}>
      {busy ? '결제창 여는 중...' : `${amount.toLocaleString('ko-KR')}원 ${LABEL[method]}`}
    </button>
  );
}
