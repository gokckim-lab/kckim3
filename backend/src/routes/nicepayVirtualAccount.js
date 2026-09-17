const express = require('express');
const crypto = require('crypto');
const iconv = require('iconv-lite');
const { supabaseAdmin } = require('../supabaseAdmin');
const { requireAuth } = require('../requireAuth');

const router = express.Router();

// 카드결제(AUTHNICE.js)는 clientId/secretKey를 쓰지만, 가상계좌 발급은 "비인증 결제" API라
// MID(가맹점 아이디)와 MerchantKey를 따로 쓴다. 가맹점관리자페이지(npg.nicepay.co.kr)
// > 가맹점정보 > KEY관리 에서 확인. 가상계좌 서비스 자체도 영업담당자와 별도 협의가 필요할 수 있다.
const MID = process.env.NICEPAY_MID;
const MERCHANT_KEY = process.env.NICEPAY_MERCHANT_KEY;
const BANK_CODE = process.env.NICEPAY_VA_BANK_CODE || '088'; // 088 = 신한은행 (기존 무통장입금 계좌와 동일 은행)
const VA_HOST = 'https://webapi.nicepay.co.kr';

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

function pad2(n) { return String(n).padStart(2, '0'); }

// EdiDate(요청 파라미터용): YYYYMMDDHHMISS
function formatEdiDate(d) {
  return (
    d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
  );
}

// TID 시간정보: YYMMDDHHMISS (2자리 연도)
function formatTidTime(d) {
  return (
    String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
  );
}

// TID = MID(10) + 지불수단(2, 가상계좌=03) + 매체구분(2, 일반=01) + 시간정보(12) + 랜덤(4)
function buildTid(d) {
  const random4 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${MID}0301${formatTidTime(d)}${random4}`;
}

// application/x-www-form-urlencoded, EUC-KR 인코딩 규격 준수.
// (한글 필드를 UTF-8로 그냥 encodeURIComponent 하면 나이스페이 쪽에서 깨진다.)
function eucKrFormEncode(fields) {
  return Object.entries(fields)
    .map(([key, value]) => {
      const buf = iconv.encode(String(value ?? ''), 'euc-kr');
      let encoded = '';
      for (const byte of buf) {
        const ch = String.fromCharCode(byte);
        if (byte < 128 && /[A-Za-z0-9\-_.~]/.test(ch)) {
          encoded += ch;
        } else {
          encoded += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
        }
      }
      return `${key}=${encoded}`;
    })
    .join('&');
}

function extractOwnerId(moid) {
  const m = /^VA-([0-9a-fA-F-]{36})-\d+$/.exec(moid || '');
  return m ? m[1] : null;
}

// 가상계좌 발급: 충전 신청 시 일회성 입금 전용 계좌번호를 만들어준다.
router.post('/issue', requireAuth, async (req, res) => {
  const { amount } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: '충전 금액을 입력해주세요.' });
  if (!MID || !MERCHANT_KEY) {
    return res.status(500).json({ error: '서버에 NICEPAY_MID / NICEPAY_MERCHANT_KEY 가 설정되지 않았습니다.' });
  }

  const now = new Date();
  const ediDate = formatEdiDate(now);
  const tid = buildTid(now);
  const moid = `VA-${req.user.id}-${now.getTime()}`;
  const signData = sha256Hex(`${MID}${amt}${ediDate}${moid}${MERCHANT_KEY}`);
  const expDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 입금 기한 24시간
  const vbankExpDate = `${expDate.getFullYear()}${pad2(expDate.getMonth() + 1)}${pad2(expDate.getDate())}`;

  const body = eucKrFormEncode({
    TID: tid,
    MID,
    EdiDate: ediDate,
    Moid: moid,
    Amt: String(amt),
    GoodsName: 'Birdie Bill 포인트 충전',
    SignData: signData,
    CashReceiptType: '0',
    BankCode: BANK_CODE,
    VbankExpDate: vbankExpDate,
    EdiType: 'JSON',
  });

  try {
    const nicepayRes = await fetch(`${VA_HOST}/webapi/get_vacount.jsp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=euc-kr' },
      body,
    });
    const rawBuf = Buffer.from(await nicepayRes.arrayBuffer());
    const decoded = iconv.decode(rawBuf, 'euc-kr');
    const result = JSON.parse(decoded);

    if (result.ResultCode !== '4100') {
      return res.status(400).json({ error: result.ResultMsg || '가상계좌 발급에 실패했습니다.' });
    }

    const { error: insertErr } = await supabaseAdmin.from('nicepay_virtual_accounts').insert({
      moid,
      tid,
      owner_id: req.user.id,
      amount: amt,
      bank_name: result.VbankBankName,
      account_num: result.VbankNum,
      expire_date: result.VbankExpDate
        ? `${result.VbankExpDate.slice(0, 4)}-${result.VbankExpDate.slice(4, 6)}-${result.VbankExpDate.slice(6, 8)}`
        : null,
    });
    if (insertErr) throw insertErr;

    res.json({
      ok: true,
      bankName: result.VbankBankName,
      accountNum: result.VbankNum,
      expireDate: result.VbankExpDate,
      expireTime: result.VbankExpTime,
      amount: amt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '가상계좌 발급 중 오류가 발생했습니다.' });
  }
});

// 나이스페이 결제통보(웹훅): 가상계좌 입금이 완료되면 나이스페이가 직접 이 URL로 호출한다.
// 가맹점관리자페이지(npg.nicepay.co.kr) > 가맹점정보 에서 "가상계좌" 통보 URL로 등록해둬야 호출된다.
// EUC-KR로 인코딩된 form 데이터로 오므로 express.urlencoded()가 아니라 raw로 받아 직접 디코딩한다.
router.post('/notify', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const decoded = iconv.decode(req.body, 'euc-kr');
    const params = new URLSearchParams(decoded);
    const resultCode = params.get('ResultCode');
    const moid = params.get('MOID') || params.get('Moid');
    const amt = params.get('Amt');
    const tid = params.get('TID');
    const depositorName = params.get('VbankInputName') || '';

    if (resultCode !== '4100') {
      // 가상계좌는 입금 완료 시에만 통보가 오므로, 실패 코드면 그냥 무시하고 OK만 응답.
      return res.status(200).send('OK');
    }

    const ownerId = extractOwnerId(moid);
    if (!ownerId) return res.status(200).send('OK');

    const { data: va } = await supabaseAdmin
      .from('nicepay_virtual_accounts')
      .select('*')
      .eq('moid', moid)
      .single();

    if (!va || va.status === 'paid') return res.status(200).send('OK'); // 이미 처리됨 (중복 통보 방어)
    if (Number(va.amount) !== Number(amt)) {
      console.error(`가상계좌 입금액 불일치: moid=${moid} 예상=${va.amount} 실제=${amt}`);
      return res.status(200).send('OK');
    }

    await supabaseAdmin
      .from('nicepay_virtual_accounts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('moid', moid);

    await supabaseAdmin.rpc('wallet_credit', {
      p_owner_id: ownerId,
      p_amount: Number(amt),
      p_memo: `가상계좌 입금 (${depositorName || tid})`,
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    // 통보 처리 중 에러가 나도 나이스페이는 실패로 보고 재통보를 시도하므로 200을 주지 않는다.
    res.status(500).send('ERROR');
  }
});

module.exports = router;
