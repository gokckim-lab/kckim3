// 나이스페이 결제창(Server 승인 모델) JS SDK를 지연 로딩한다.
// @docs https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md
async function loadNicePaySdk(): Promise<any> {
  const w = window as any;
  if (w.AUTHNICE) return w.AUTHNICE;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://pay.nicepay.co.kr/v1/js/';
    script.onload = () => (w.AUTHNICE ? resolve(w.AUTHNICE) : reject(new Error('나이스페이 SDK 로드 실패')));
    script.onerror = () => reject(new Error('나이스페이 스크립트 로드 실패 (네트워크 확인)'));
    document.head.appendChild(script);
  });
}

export function generateOrderId(userId: string) {
  return `WALLET-${userId}-${Date.now()}`;
}

/**
 * 나이스페이 결제창을 띄운다. 결제창 인증이 끝나면 나이스페이가 브라우저를
 * backend의 returnUrl(/api/payments/nicepay/return)로 직접 이동시키고,
 * 거기서 서버가 승인 처리 + 포인트 적립 후 다시 /wallet 으로 돌려보낸다.
 * 즉 이 함수 자체는 성공/실패를 반환하지 않는다(브라우저가 이동해버리므로).
 */
export async function requestNicePayCharge(
  amount: number,
  userId: string,
  onError: (message: string) => void
) {
  const clientId = import.meta.env.VITE_NICEPAY_CLIENT_ID as string | undefined;
  if (!clientId) {
    onError('나이스페이 클라이언트 키가 설정되지 않았습니다. frontend/.env 의 VITE_NICEPAY_CLIENT_ID 를 확인하세요.');
    return;
  }
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3002';

  const AUTHNICE = await loadNicePaySdk();
  AUTHNICE.requestPay({
    clientId,
    method: 'card',
    orderId: generateOrderId(userId),
    amount,
    goodsName: `Birdie Bill 포인트 충전 ${amount.toLocaleString('ko-KR')}원`,
    returnUrl: `${backendUrl}/api/payments/nicepay/return`,
    fnError: (result: { msg?: string; errorMsg?: string }) => {
      onError(result?.msg || result?.errorMsg || '결제창 오류가 발생했습니다.');
    },
  });
}
