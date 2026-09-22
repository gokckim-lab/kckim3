const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../supabaseAdmin');

const router = express.Router();

// 가상계좌도 카드결제와 같은 최신 결제창(Server 승인 모델) API를 쓴다(clientId/secretKey,
// api.nicepay.co.kr). 예전에는 MID+MerchantKey를 쓰는 구버전 webapi.nicepay.co.kr
// 방식으로 짜여 있었는데, 지금 가맹점(나이스페이 포스타트) 발급 키와 맞지 않아 다시 구현했다.
// @docs https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md
// @docs https://github.com/nicepayments/nicepay-manual/blob/main/api/hook.md
const IS_TEST = process.env.NICEPAY_IS_TEST !== 'false';
const API_BASE = IS_TEST ? 'https://sandbox-api.nicepay.co.kr' : 'https://api.nicepay.co.kr';
const SECRET_KEY = process.env.NICEPAY_SECRET_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

// 프론트에서 orderId를 `VA-<내 user id>-<타임스탬프>` 형식으로 만든다(카드결제의 WALLET- 접두사와
// 구분하기 위한 것일 뿐, 처리 방식은 동일하게 orderId에서 user id를 꺼내 쓴다).
function extractOwnerId(orderId) {
  const m = /^VA-([0-9a-fA-F-]{36})-\d+$/.exec(orderId || '');
  return m ? m[1] : null;
}

// 결제창(가상계좌 "채번") 인증 결과가 여기로 POST된다. 이 단계는 입금 계좌를 만드는 것일 뿐,
// 아직 돈이 들어온 건 아니다. 실제 입금 완료는 /webhook 으로 별도 통보된다.
router.post('/return', express.urlencoded({ extended: true }), async (req, res) => {
  const { authResultCode, authResultMsg, tid, clientId, orderId, amount, authToken, signature } = req.body || {};

  const fail = (reason) =>
    res.redirect(`${FRONTEND_ORIGIN}/wallet?vbank=fail&reason=${encodeURIComponent(reason || '알 수 없는 오류')}`);

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

    // 가상계좌는 채번에 성공해도 status가 'ready'(입금 대기)로 온다. 'paid'를 요구하면 안 된다.
    if (approveJson.resultCode !== '0000' || !approveJson.vbank) {
      return fail(approveJson.resultMsg || '가상계좌 발급에 실패했습니다.');
    }

    const { vbank } = approveJson;
    const { error: insertErr } = await supabaseAdmin.from('nicepay_virtual_accounts').insert({
      moid: orderId,
      tid,
      owner_id: ownerId,
      amount: Number(amount),
      bank_name: vbank.vbankName,
      account_num: vbank.vbankNumber,
      expire_date: vbank.vbankExpDate ? vbank.vbankExpDate.slice(0, 10) : null,
    });
    if (insertErr) throw insertErr;

    const q = new URLSearchParams({
      vbank: 'success',
      bankName: vbank.vbankName || '',
      accountNum: vbank.vbankNumber || '',
      expireDate: vbank.vbankExpDate || '',
      holder: vbank.vbankHolder || '',
      amount: String(amount),
    });
    return res.redirect(`${FRONTEND_ORIGIN}/wallet?${q.toString()}`);
  } catch (err) {
    console.error(err);
    return fail('서버 오류가 발생했습니다.');
  }
});

// 웹훅: 결제수단 이벤트(가상계좌 채번, 입금 완료 등) 발생 시 나이스페이가 직접 이 URL로 호출한다.
// 나이스페이 포스타트 관리자 > 개발정보 > 웹훅 에서 이 URL을 등록해둬야 호출된다.
// 반드시 200 + "OK"(text/html)로 응답해야 성공으로 처리되고, 그렇지 않으면 재전송된다.
router.post('/webhook', express.json(), async (req, res) => {
  const ackOk = () => res.status(200).type('text/html').send('OK');
  try {
    const { resultCode, tid, orderId, amount, ediDate, signature, status, payMethod } = req.body || {};

    // 가상계좌 입금 완료 이벤트만 처리한다. 채번/취소 등 다른 이벤트는 그냥 확인만 하고 넘어간다.
    if (resultCode !== '0000' || payMethod !== 'vbank' || status !== 'paid') return ackOk();
    if (!SECRET_KEY) return ackOk();

    const expected = sha256Hex(`${tid}${amount}${ediDate}${SECRET_KEY}`);
    if (signature && expected !== signature) {
      console.error(`나이스페이 웹훅 위변조 검증 실패: orderId=${orderId}`);
      return ackOk();
    }

    const { data: outcome, error } = await supabaseAdmin.rpc('credit_virtual_account_deposit', {
      p_moid: orderId,
      p_amount: Number(amount),
      p_memo: `가상계좌 입금 (${tid})`,
    });
    if (error) throw error;
    if (outcome === 'amount_mismatch') {
      console.error(`가상계좌 입금액 불일치: orderId=${orderId} 실제=${amount}`);
    }

    return ackOk();
  } catch (err) {
    console.error(err);
    // 실패로 응답해야 나이스페이가 재전송을 시도한다(일시적 DB 오류 등 복구 가능한 실패 대비).
    return res.status(500).type('text/html').send('ERROR');
  }
});

module.exports = router;
