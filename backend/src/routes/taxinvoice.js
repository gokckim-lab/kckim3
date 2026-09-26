const express = require('express');
const { popbill, taxinvoiceService } = require('../popbillClient');
const { supabaseAdmin } = require('../supabaseAdmin');
const { requireAuth } = require('../requireAuth');

const router = express.Router();
const CORP_NUM = process.env.POPBILL_CORP_NUM;
const USER_ID = process.env.POPBILL_USER_ID || undefined;
// 세금계산서 1건 발행 시 우리 서비스 지갑(wallets.balance)에서 차감할 포인트(원).
// 팝빌 자체 포인트(getBalance)와는 별개로, 입점 도소매업체가 선불 충전한 잔액이다.
const ISSUE_PRICE = Number(process.env.POPBILL_ISSUE_PRICE || 200);

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// 발행 완료 후 이메일로 세금계산서 발송 (실패해도 발행 자체는 이미 끝난 상태이므로 예외를 던지지 않는다)
// 팝빌 sendEmail은 한 번에 수신자 한 명만 받으므로, 공급자/공급받는자에게 각각 보내려면 두 번 호출해야 한다.
function sendTaxinvoiceEmail(mgtKey, receiver) {
  return new Promise((resolve) => {
    if (!receiver) return resolve({ sent: false, reason: '이메일이 입력되지 않았습니다.' });
    taxinvoiceService.sendEmail(
      CORP_NUM,
      popbill.MgtKeyType.SELL,
      mgtKey,
      receiver,
      USER_ID,
      () => resolve({ sent: true }),
      (err) => resolve({ sent: false, reason: `[${err.code}] ${err.message}` })
    );
  });
}

// 팝빌 포인트 잔액 조회
router.get('/balance', requireAuth, (req, res) => {
  taxinvoiceService.getBalance(
    CORP_NUM,
    (balance) => res.json({ balance }),
    (err) => res.status(400).json({ error: err.message, code: err.code })
  );
});

// 우리 회사(공급자)가 팝빌 연동회원인지 확인
router.get('/check-member', requireAuth, (req, res) => {
  taxinvoiceService.checkIsMember(
    CORP_NUM,
    (result) => res.json(result),
    (err) => res.status(400).json({ error: err.message, code: err.code })
  );
});

// orgNTSConfirmNum: 수정세금계산서일 때만 넘긴다 — 원본(이 문서가 수정하는 세금계산서)의
// 국세청승인번호. modifyCode(사유코드 1~6)와 함께 있어야 팝빌이 "수정발행"으로 처리한다.
function buildTaxinvoice(doc, items, orgNTSConfirmNum) {
  const supplier = doc.supplier || {};
  const customer = doc.customer || {};
  const isCorp = customer.bizNo && onlyDigits(customer.bizNo).length === 10;

  const taxinvoice = {
    writeDate: (doc.issue_date || '').replace(/-/g, ''),
    chargeDirection: '정과금',
    issueType: '정발행',
    purposeType: customer.purposeType === '청구' ? '청구' : '영수',
    taxType: customer.taxType || '과세',

    invoicerCorpNum: onlyDigits(supplier.bizNo),
    invoicerMgtKey: doc.doc_no,
    invoicerTaxRegID: '',
    invoicerCorpName: supplier.name || '',
    invoicerCEOName: supplier.ceo || '',
    invoicerAddr: supplier.address || '',
    invoicerBizClass: supplier.bizItem || '',
    invoicerBizType: supplier.bizType || '',
    invoicerContactName: supplier.contact || supplier.ceo || '',
    invoicerEmail: supplier.email || '',
    invoicerTEL: supplier.tel || '',

    invoiceeType: isCorp ? '사업자' : '개인',
    invoiceeCorpNum: onlyDigits(customer.bizNo) || '0000000000',
    invoiceeMgtKey: doc.doc_no,
    invoiceeCorpName: customer.name || '',
    invoiceeCEOName: customer.ceo || '',
    invoiceeAddr: customer.address || '',
    invoiceeBizClass: customer.bizItem || '',
    invoiceeBizType: customer.bizType || '',
    invoiceeContactName1: customer.contact || customer.ceo || '',
    invoiceeEmail1: customer.email || '',
    invoiceeTEL1: customer.tel || '',

    supplyCostTotal: String(doc.supply_total ?? 0),
    taxTotal: String(doc.tax_total ?? 0),
    totalAmount: String(doc.grand_total ?? 0),

    remark1: doc.memo || '',

    detailList: (items || []).map((it, idx) => ({
      serialNum: idx + 1,
      purchaseDT: (doc.issue_date || '').replace(/-/g, ''),
      itemName: it.name || '',
      spec: it.spec || '',
      qty: String(it.qty ?? ''),
      unitCost: String(it.unit_price ?? ''),
      supplyCost: String(it.supply_price ?? ''),
      tax: String(it.tax ?? ''),
      remark: it.remark || '',
    })),
  };

  if (doc.modify_code && orgNTSConfirmNum) {
    taxinvoice.modifyCode = String(doc.modify_code);
    taxinvoice.orgNTSConfirmNum = orgNTSConfirmNum;
  }

  return taxinvoice;
}

// 문서(견적/주문/거래명세서) -> 세금계산서 등록+즉시발행
router.post('/issue', requireAuth, async (req, res) => {
  const { documentId } = req.body || {};
  if (!documentId) return res.status(400).json({ error: 'documentId가 필요합니다.' });

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('*, document_items(*)')
    .eq('id', documentId)
    .eq('created_by', req.user.id)
    .single();

  if (docErr || !doc) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (doc.popbill_status === 'ISSUED') {
    return res.status(409).json({ error: '이미 발행된 세금계산서입니다.' });
  }
  if (doc.popbill_status === 'CANCELED') {
    // 이 문서번호(doc_no)는 이미 팝빌에 발행취소로 기록되어 있어 그대로 재사용하면 안 된다.
    // 다시 발행하려면 새 세금계산서 문서를 만들어야 한다.
    return res.status(409).json({ error: '발행취소된 세금계산서입니다. 재발행하려면 새 세금계산서를 작성해주세요.' });
  }
  if (!CORP_NUM || CORP_NUM === '0000000000') {
    return res.status(500).json({ error: '서버에 POPBILL_CORP_NUM 이 설정되지 않았습니다. backend/.env 를 확인하세요.' });
  }

  // 수정세금계산서(이 문서가 다른 문서를 수정하는 경우)는 원본의 국세청승인번호가 있어야
  // 팝빌이 수정발행으로 처리한다 — 원본이 아직 발행 전이거나 취소된 상태면 승인번호가 없다.
  let orgNTSConfirmNum;
  if (doc.revises_document_id) {
    const { data: original } = await supabaseAdmin
      .from('documents')
      .select('popbill_nts_confirm_num, popbill_status, created_by')
      .eq('id', doc.revises_document_id)
      .single();
    if (!original || original.created_by !== req.user.id) {
      return res.status(404).json({ error: '수정 대상 원본 세금계산서를 찾을 수 없습니다.' });
    }
    if (!original.popbill_nts_confirm_num) {
      return res.status(409).json({ error: '원본 세금계산서가 아직 발행(국세청 승인)되지 않았습니다.' });
    }
    orgNTSConfirmNum = original.popbill_nts_confirm_num;
  }

  // 견적서/주문서/거래명세서는 무료, 세금계산서 "발행" 단계에서만 선불 포인트를 차감한다.
  // 팝빌 호출 전에 먼저 원자적으로 차감(예약)해서, 동시에 여러 번 눌러도 잔액이 음수가 되지 않게 한다.
  // 팝빌 발행이 실패하면 아래 error 콜백에서 즉시 환불한다.
  const { data: newBalance, error: deductErr } = await supabaseAdmin.rpc('wallet_try_deduct', {
    p_owner_id: doc.owner_id,
    p_amount: ISSUE_PRICE,
    p_document_id: documentId,
  });
  if (deductErr) return res.status(500).json({ error: `포인트 차감 중 오류: ${deductErr.message}` });
  if (newBalance === null) {
    return res.status(402).json({ error: `포인트 잔액이 부족합니다. (건당 ${ISSUE_PRICE}포인트 필요) 충전 후 다시 시도해주세요.` });
  }

  const taxinvoice = buildTaxinvoice(doc, doc.document_items, orgNTSConfirmNum);

  const supplierName = (doc.supplier || {}).name || 'Birdie Bill';

  taxinvoiceService.registIssue(
    CORP_NUM,
    taxinvoice,
    false, // writeSpecification
    true, // forceIssue: 발행 유예/보류 거래처라도 강제 발행
    '', // memo
    `[${supplierName}] 전자세금계산서가 발행되었습니다`, // emailSubject
    '', // dealInvoiceMgtKey
    USER_ID,
    async (result) => {
      const ntsConfirmNum = result.ntsConfirmNum || '';
      await supabaseAdmin
        .from('documents')
        .update({
          popbill_status: 'ISSUED',
          popbill_mgt_key: doc.doc_no,
          popbill_nts_confirm_num: ntsConfirmNum,
          popbill_issued_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      // 공급받는자·공급자 양쪽에 세금계산서 이메일 자동 발송. 실패해도 발행 자체는 이미 성공했으므로
      // 응답의 emailSent/supplierEmailSent 값으로만 알리고, 발행 응답 자체를 실패로 바꾸지 않는다.
      const [emailResult, supplierEmailResult] = await Promise.all([
        sendTaxinvoiceEmail(doc.doc_no, (doc.customer || {}).email),
        sendTaxinvoiceEmail(doc.doc_no, (doc.supplier || {}).email),
      ]);

      res.json({
        ok: true,
        ntsConfirmNum,
        code: result.code,
        message: result.message,
        walletBalance: newBalance,
        emailSent: emailResult.sent,
        emailError: emailResult.sent ? undefined : emailResult.reason,
        supplierEmailSent: supplierEmailResult.sent,
        supplierEmailError: supplierEmailResult.sent ? undefined : supplierEmailResult.reason,
      });
    },
    async (err) => {
      await supabaseAdmin
        .from('documents')
        .update({ popbill_status: 'FAILED', popbill_last_error: `[${err.code}] ${err.message}` })
        .eq('id', documentId);
      await supabaseAdmin.rpc('wallet_refund', {
        p_owner_id: doc.owner_id,
        p_amount: ISSUE_PRICE,
        p_document_id: documentId,
      });
      res.status(400).json({ error: err.message, code: err.code });
    }
  );
});

// 발행취소: 국세청 전송 "전"에만 가능하다(팝빌이 그 시점을 판단해 실패시키므로 여기서는 상태만 확인).
// 이미 국세청에 전송된 건은 팝빌이 에러로 거절하며, 그 경우 수정세금계산서로 처리해야 한다.
// 발행 시 차감한 포인트는 취소 성공 시 환불한다.
router.post('/:documentId/cancel', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { memo } = req.body || {};

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('id, doc_no, owner_id, popbill_status, created_by')
    .eq('id', documentId)
    .single();

  if (!doc || doc.created_by !== req.user.id) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (doc.popbill_status !== 'ISSUED') return res.status(409).json({ error: '발행된 세금계산서만 취소할 수 있습니다.' });

  taxinvoiceService.cancelIssue(
    CORP_NUM,
    popbill.MgtKeyType.SELL,
    doc.doc_no,
    memo || '',
    USER_ID,
    async () => {
      await supabaseAdmin
        .from('documents')
        .update({ popbill_status: 'CANCELED' })
        .eq('id', documentId);
      const { data: newBalance } = await supabaseAdmin.rpc('wallet_refund', {
        p_owner_id: doc.owner_id,
        p_amount: ISSUE_PRICE,
        p_document_id: documentId,
      });
      res.json({ ok: true, walletBalance: newBalance });
    },
    (err) => res.status(400).json({ error: err.message, code: err.code })
  );
});

// 발행된 세금계산서를 (다시) 이메일로 보낸다. 발행 시 이메일이 비어있었거나 잘못 입력된 경우 사용.
router.post('/:documentId/resend-email', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { email } = req.body || {};

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('doc_no, popbill_status, created_by, customer')
    .eq('id', documentId)
    .single();

  if (!doc || doc.created_by !== req.user.id) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (doc.popbill_status !== 'ISSUED') return res.status(409).json({ error: '아직 발행되지 않았습니다.' });

  const receiver = email || (doc.customer || {}).email;
  const result = await sendTaxinvoiceEmail(doc.doc_no, receiver);
  if (!result.sent) return res.status(400).json({ error: result.reason || '이메일 발송에 실패했습니다.' });
  res.json({ ok: true });
});

// 발행된 세금계산서 팝업(인쇄/조회) URL
router.get('/:documentId/popup-url', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('doc_no, popbill_status, created_by')
    .eq('id', documentId)
    .single();

  if (!doc || doc.created_by !== req.user.id) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (doc.popbill_status !== 'ISSUED') return res.status(409).json({ error: '아직 발행되지 않았습니다.' });

  taxinvoiceService.getPopUpURL(
    CORP_NUM,
    popbill.MgtKeyType.SELL,
    doc.doc_no,
    USER_ID,
    (url) => res.json({ url }),
    (err) => res.status(400).json({ error: err.message, code: err.code })
  );
});

module.exports = router;
