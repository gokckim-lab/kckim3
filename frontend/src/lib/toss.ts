import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk';

export { ANONYMOUS };

export async function createTossWidgets(customerKey: string) {
  const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;
  if (!clientKey) {
    throw new Error('토스페이먼츠 클라이언트 키가 설정되지 않았습니다. frontend/.env 의 VITE_TOSS_CLIENT_KEY 를 확인하세요.');
  }
  const tossPayments = await loadTossPayments(clientKey);
  return tossPayments.widgets({ customerKey });
}

export function generateOrderId(userId: string) {
  return `WALLET-${userId}-${Date.now()}`;
}
