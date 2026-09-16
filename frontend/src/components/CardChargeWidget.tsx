import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { createTossWidgets, generateOrderId } from '../lib/toss';

interface Props {
  amount: number;
}

// 토스페이먼츠 결제위젯(v2 SDK)을 이 컴포넌트 안에 직접 마운트한다.
// 금액이 바뀌면 setAmount로 위젯에 반영하고, "결제하기" 클릭 시 결제창으로 이동한다.
export default function CardChargeWidget({ amount }: Props) {
  const { user } = useAuth();
  const notify = useToast();
  const methodRef = useRef<HTMLDivElement>(null);
  const agreementRef = useRef<HTMLDivElement>(null);
  const widgetsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const widgets = await createTossWidgets(user.id);
        if (cancelled) return;
        widgetsRef.current = widgets;
        await widgets.setAmount({ currency: 'KRW', value: amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: '#toss-payment-method', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#toss-agreement', variantKey: 'AGREEMENT' }),
        ]);
        if (!cancelled) setReady(true);
      } catch (e: any) {
        notify(`결제창 로딩 실패: ${e.message}`, 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (ready && widgetsRef.current) {
      widgetsRef.current.setAmount({ currency: 'KRW', value: amount }).catch(() => {});
    }
  }, [amount, ready]);

  const pay = async () => {
    if (!user || !widgetsRef.current) return;
    setPaying(true);
    try {
      await widgetsRef.current.requestPayment({
        orderId: generateOrderId(user.id),
        orderName: `Birdie Bill 포인트 충전 ${amount.toLocaleString('ko-KR')}원`,
        successUrl: `${window.location.origin}/payments/toss/success`,
        failUrl: `${window.location.origin}/payments/toss/fail`,
        customerEmail: user.email,
      });
      // 성공/취소 모두 브라우저가 successUrl/failUrl로 이동하므로 이후 코드는 보통 실행되지 않는다.
    } catch (e: any) {
      if (e?.code !== 'USER_CANCEL') notify(`결제 요청 실패: ${e.message ?? e}`, 'error');
      setPaying(false);
    }
  };

  return (
    <div className="space-y-2">
      <div id="toss-payment-method" ref={methodRef} />
      <div id="toss-agreement" ref={agreementRef} />
      <button onClick={pay} disabled={!ready || paying}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
        {!ready ? '결제창 불러오는 중...' : paying ? '결제창 여는 중...' : `${amount.toLocaleString('ko-KR')}원 결제하기`}
      </button>
    </div>
  );
}
