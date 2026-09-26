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

// 가상계좌 콜백(backend/src/routes/nicepayVirtualAccount.js)은 주문번호가 "VA-" 접두사여야만
// 소유자를 알아낼 수 있다. 카드결제와 같은 generateOrderId("WALLET-...")를 쓰면 그 접두사가 안 맞아
// "주문번호 형식이 올바르지 않습니다" 에러로 발급 자체가 실패한다.
export function generateVirtualAccountOrderId(userId: string) {
  return `VA-${userId}-${Date.now()}`;
}

/**
 * 나이스페이 결제창을 띄운다. 결제창 인증이 끝나면 나이스페이가 브라우저를
 * backend의 returnUrl(/api/payments/nicepay/return)로 직접 이동시키고,
 * 거기서 서버가 승인 처리 + 포인트 적립 후 다시 /wallet 으로 돌려보낸다.
 * 즉 이 함수 자체는 성공/실패를 반환하지 않는다(브라우저가 이동해버리므로).
 */
export interface BuyerInfo {
  buyerName?: string;
  buyerTel?: string;
  buyerEmail?: string;
}

// 카드결제와 계좌이체(실시간)는 둘 다 결제창에서 인증이 끝나면 나이스페이가 즉시
// backend의 /api/payments/nicepay/return 으로 결과를 넘겨주고, 거기서 서버가 승인+포인트
// 적립까지 한 번에 끝낸다(가상계좌처럼 별도 웹훅을 기다릴 필요가 없다). 그래서 둘 다 같은
// 처리 로직을 공유하고 method 값만 다르다.
async function requestNicePayInstant(
  method: 'card' | 'bank',
  amount: number,
  userId: string,
  onError: (message: string) => void,
  buyer?: BuyerInfo
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
    method,
    orderId: generateOrderId(userId),
    amount,
    goodsName: `Birdie Bill 포인트 충전 ${amount.toLocaleString('ko-KR')}원`,
    returnUrl: `${backendUrl}/api/payments/nicepay/return`,
    ...buyer,
    fnError: (result: { msg?: string; errorMsg?: string }) => {
      onError(result?.msg || result?.errorMsg || '결제창 오류가 발생했습니다.');
    },
  });
}

export async function requestNicePayCharge(
  amount: number,
  userId: string,
  onError: (message: string) => void,
  buyer?: BuyerInfo
) {
  return requestNicePayInstant('card', amount, userId, onError, buyer);
}

/** 실시간 계좌이체로 충전한다. 카드결제와 동일하게 관리자 확인 없이 즉시 자동 반영된다. */
export async function requestNicePayBankTransfer(
  amount: number,
  userId: string,
  onError: (message: string) => void,
  buyer?: BuyerInfo
) {
  return requestNicePayInstant('bank', amount, userId, onError, buyer);
}

/**
 * 나이스페이 가상계좌를 발급받는다(카드결제와 같은 결제창 Server 승인 모델).
 * 계좌 "채번"까지만 이 흐름으로 처리되고, 실제 입금 완료는 나이스페이가 보내는
 * 웹훅(backend의 /api/payments/nicepay/virtual-account/webhook)으로 별도 통보된다.
 * @docs https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md
 */
export async function requestNicePayVirtualAccount(
  amount: number,
  userId: string,
  vbankHolder: string,
  onError: (message: string) => void,
  buyer?: BuyerInfo
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
    method: 'vbank',
    orderId: generateVirtualAccountOrderId(userId),
    amount,
    goodsName: `Birdie Bill 포인트 충전 ${amount.toLocaleString('ko-KR')}원`,
    vbankHolder,
    returnUrl: `${backendUrl}/api/payments/nicepay/virtual-account/return`,
    ...buyer,
    fnError: (result: { msg?: string; errorMsg?: string }) => {
      onError(result?.msg || result?.errorMsg || '결제창 오류가 발생했습니다.');
    },
  });
}
