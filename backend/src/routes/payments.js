const express = require('express');
const { supabaseAdmin } = require('../supabaseAdmin');
const { requireAuth } = require('../requireAuth');

const router = express.Router();
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

// 토스페이먼츠 결제창(v1) 완료 후, 프론트에서 successUrl로 돌아오면서 받은
// paymentKey/orderId/amount를 그대로 넘겨준다. 여기서 실제 승인(confirm)을
// 서버에서 확정하고, 성공하면 지갑 잔액에 반영한다.
router.post('/toss/confirm', requireAuth, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body || {};
  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '결제 정보가 부족합니다.' });
  }
  if (!TOSS_SECRET_KEY) {
    return res.status(500).json({ error: '서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다. backend/.env 를 확인하세요.' });
  }
  // orderId는 프론트에서 `WALLET-<내 user id>-<타임스탬프>` 형식으로 생성한다.
  // 다른 사람의 orderId를 도용해 자기 계정에 적립하는 것을 막기 위한 최소한의 검증.
  if (!orderId.startsWith(`WALLET-${req.user.id}-`)) {
    return res.status(403).json({ error: '본인 결제 건이 아닙니다.' });
  }

  try {
    const basicAuth = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const payment = await tossRes.json();

    if (!tossRes.ok) {
      return res.status(400).json({ error: payment.message || '결제 승인에 실패했습니다.', code: payment.code });
    }

    // paymentKey를 PK로 먼저 기록해서 confirm이 중복 호출돼도 적립이 한 번만 되도록 한다.
    const { error: insertErr } = await supabaseAdmin
      .from('toss_payments')
      .insert({ payment_key: paymentKey, order_id: orderId, owner_id: req.user.id, amount: payment.totalAmount });

    if (insertErr) {
      if (insertErr.code === '23505') {
        // 이미 처리된 결제 (중복 confirm 호출) - 재적립하지 않고 현재 잔액만 조회해서 반환
        const { data: wallet } = await supabaseAdmin.from('wallets').select('balance').eq('owner_id', req.user.id).single();
        return res.json({ ok: true, alreadyProcessed: true, balance: wallet?.balance ?? null });
      }
      throw insertErr;
    }

    const { data: newBalance, error: creditErr } = await supabaseAdmin.rpc('wallet_credit', {
      p_owner_id: req.user.id,
      p_amount: payment.totalAmount,
      p_memo: `토스페이먼츠 카드결제 (${payment.method || 'CARD'}, ${paymentKey.slice(0, 12)}...)`,
    });
    if (creditErr) throw creditErr;

    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '결제 확인 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
