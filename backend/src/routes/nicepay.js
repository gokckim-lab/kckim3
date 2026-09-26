const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../supabaseAdmin');

const router = express.Router();

const IS_TEST = process.env.NICEPAY_IS_TEST !== 'false';
const API_BASE = IS_TEST ? 'https://sandbox-api.nicepay.co.kr' : 'https://api.nicepay.co.kr';
const SECRET_KEY = process.env.NICEPAY_SECRET_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

// 프론트에서 orderId를 `WALLET-<내 user id>-<타임스탬프>` 형식으로 만든다.
// 이 콜백은 나이스페이가 브라우저를 통해 직접 POST하는 것이라 우리 쪽 로그인 토큰이 없으므로,
// orderId 안에 넣어둔 user id로 누구에게 적립할지 판단한다.
function extractOwnerId(orderId) {
  const m = /^WALLET-([0-9a-fA-F-]{36})-\d+$/.exec(orderId || '');
  return m ? m[1] : null;
}

// 나이스페이 결제창(Server 승인 모델) 인증 결과가 여기로 POST된다.
// @docs https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md
router.post('/return', express.urlencoded({ extended: true }), async (req, res) => {
  const { authResultCode, authResultMsg, tid, clientId, orderId, amount, authToken, signature } = req.body || {};

  const fail = (reason) => res.redirect(`${FRONTEND_ORIGIN}/wallet?nicepay=fail&reason=${encodeURIComponent(reason || '알 수 없는 오류')}`);

  if (!SECRET_KEY) return fail('서버에 NICEPAY_SECRET_KEY 가 설정되지 않았습니다.');
  if (authResultCode !== '0000') return fail(authResultMsg);

  // 위변조 검증: hex(sha256(authToken + clientId + amount + SecretKey))
  const expectedSignature = sha256Hex(`${authToken}${clientId}${amount}${SECRET_KEY}`);
  if (expectedSignature !== signature) return fail('위변조 검증 실패');

  const ownerId = extractOwnerId(orderId);
  if (!ownerId) return fail('주문번호 형식이 올바르지 않습니다.');

  try {
    const ediDate = new Date().toISOString();
    const signData = sha256Hex(`${tid}${amount}${ediDate}${SECRET_KEY}`);
    const basicAuth = Buffer.from(`${clientId}:${SECRET_KEY}`).toString('base64');

    const approveRes = await fetch(`${API_BASE}/v1/payments/${encodeURIComponent(tid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basicAuth}` },
      body: JSON.stringify({ amount: Number(amount), ediDate, signData, returnCharSet: 'utf-8' }),
    });
    const approveJson = await approveRes.json();

    if (approveJson.resultCode !== '0000' || approveJson.status !== 'paid') {
      return fail(approveJson.resultMsg || '결제 승인에 실패했습니다.');
    }

    // 이 콜백은 카드결제와 계좌이체(실시간) 둘 다 받는다 — 결과 승인 방식이 동일하기 때문.
    // 팝빌 등과 달리 결제수단 이름은 승인 응답의 payMethod로 구분해 메모에만 반영한다.
    const methodLabel = approveJson.payMethod === 'bank' ? '계좌이체' : '카드결제';

    // 결제 기록(tid가 PK라 중복 콜백은 무시됨)과 포인트 적립을 DB 함수 하나로 묶어 처리한다.
    // 적립이 실패하면 결제 기록도 함께 되돌려져서, 콜백을 다시 받았을 때 정상 적립된다.
    const { error: creditErr } = await supabaseAdmin.rpc('credit_card_payment', {
      p_tid: tid,
      p_order_id: orderId,
      p_owner_id: ownerId,
      p_amount: Number(amount),
      p_memo: `나이스페이 ${methodLabel} (${String(tid).slice(0, 12)}...)`,
    });
    if (creditErr) throw creditErr;

    return res.redirect(`${FRONTEND_ORIGIN}/wallet?nicepay=success&amount=${encodeURIComponent(amount)}`);
  } catch (err) {
    console.error(err);
    return fail('서버 오류가 발생했습니다.');
  }
});

module.exports = router;
