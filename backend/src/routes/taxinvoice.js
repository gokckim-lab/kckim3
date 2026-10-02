const express = require('express');
const { popbill, taxinvoiceService } = require('../popbillClient');
const { supabaseAdmin } = require('../supabaseAdmin');
const { requireAuth } = require('../requireAuth');
const { sendMail, escapeHtml } = require('../mailer');

const router = express.Router();
const CORP_NUM = process.env.POPBILL_CORP_NUM;
const USER_ID = process.env.POPBILL_USER_ID || undefined;
// 세금계산서 1건 발행 시 우리 서비스 지갑(wallets.balance)에서 차감할 포인트(원).
// 팝빌 자체 포인트(getBalance)와는 별개로, 입점 도소매업체가 선불 충전한 잔액이다.
const ISSUE_PRICE = Number(process.env.POPBILL_ISSUE_PRICE || 200);

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

const issueMailSubject = (supplierName) => `[버디빌] ${supplierName}에서 전자세금계산서가 발행되었습니다`;
const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

function getMailURL(mgtKey) {
  return new Promise((resolve, reject) => {
    taxinvoiceService.getMailURL(CORP_NUM, popbill.MgtKeyType.SELL, mgtKey, USER_ID, resolve, (err) =>
      reject(new Error(`[${err.code}] ${err.message}`))
    );
  });
}

// 팝빌 sendEmail(재전송)은 제목을 지정할 수 없어 팝빌 기본 양식으로 나가므로, 재발송과 공급자 사본은 버디빌 발신으로 직접 보낸다.
async function sendBrandedTaxinvoiceEmail(doc, receiver, { toSupplier = false } = {}) {
  if (!receiver) return { sent: false, reason: `${toSupplier ? '공급자' : '공급받는자'} 이메일이 입력되지 않았습니다.` };
  try {
    const supplier = doc.supplier || {};
    const customer = doc.customer || {};
    const supplierName = supplier.name || '공급자';
    const customerName = customer.name || '공급받는자';
    const heading = toSupplier
      ? `${customerName}에 전자세금계산서를 발행했습니다`
      : `${supplierName}에서 전자세금계산서를 발행했습니다`;
    const subject = toSupplier ? `[버디빌] ${heading} (공급자 보관용)` : issueMailSubject(supplierName);
    const footer = toSupplier
      ? '이 메일은 버디빌(birdiebill.co.kr)에서 발행한 세금계산서의 공급자 보관용 사본입니다.'
      : `이 메일은 버디빌(birdiebill.co.kr)을 통해 발송되었습니다. 문의는 이 메일에 회신하시면 ${supplierName}에 전달됩니다.`;
    const viewUrl = await getMailURL(doc.doc_no);
    const rows = [
      ['공급자', supplierName],
      ['공급받는자', customer.name || ''],
      ['작성일자', doc.issue_date || ''],
      ['공급가액', won(doc.supply_total)],
      ['세액', won(doc.tax_total)],
      ['합계금액', won(doc.grand_total)],
      ['국세청 승인번호', doc.popbill_nts_confirm_num || ''],
    ];
    const html = `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows
      .map(([k, v]) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;width:130px">${k}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(v)}</td></tr>`)
      .join('')}</table>
<p style="margin:24px 0"><a href="${escapeHtml(viewUrl)}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">세금계산서 보기</a></p>
<p style="font-size:12px;color:#94a3b8">${escapeHtml(footer)}</p>
</div>`;
    const text = `${heading}.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n세금계산서 보기: ${viewUrl}\n\n${footer}`;
    await sendMail({ to: receiver, subject, html, text, replyTo: toSupplier ? undefined : supplier.email });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

// 발행 성공한 세금계산서의 공급받는자를 거래처 목록에 저장한다. 사업자번호(없으면 상호)로 기존 거래처를 찾고,
// 이미 있으면 사용자가 정리해둔 값을 덮어쓰지 않도록 빈 칸만 채운다.
async function saveCustomerFromInvoice(doc) {
  const c = doc.customer || {};
  const name = (c.name || '').trim();
  if (!name) return;
  const fields = {
    biz_no: c.bizNo || '', name, ceo: c.ceo || '', address: c.address || '', biz_type: c.bizType || '',
    biz_item: c.bizItem || '', email: c.email || '', tel: c.tel || '', contact: c.contact || '',
  };

  const { data: list, error } = await supabaseAdmin.from('customers').select('*').eq('owner_id', doc.owner_id);
  if (error) throw error;
  const bizNo = onlyDigits(fields.biz_no);
  const existing =
    list.find((x) => x.id === doc.customer_id) ||
    (bizNo.length === 10
      ? list.find((x) => onlyDigits(x.biz_no) === bizNo)
      : list.find((x) => !onlyDigits(x.biz_no) && x.name.trim() === name));

  let customerId;
  if (existing) {
    customerId = existing.id;
    const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v && !String(existing[k] || '').trim()));
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabaseAdmin.from('customers').update(patch).eq('id', existing.id);
      if (upErr) throw upErr;
    }
  } else {
    const { data: created, error: insErr } = await supabaseAdmin
      .from('customers')
      .insert({ ...fields, owner_id: doc.owner_id })
      .select('id')
      .single();
    if (insErr) throw insErr;
    customerId = created.id;
  }

  if (doc.customer_id !== customerId) {
    await supabaseAdmin.from('documents').update({ customer_id: customerId }).eq('id', doc.id);
  }
}

// 발행한 세금계산서의 품목을 품목 목록에 저장한다. 품목명+규격이 같으면 이미 있는 것으로 보고 건드리지 않는다
// (단가는 거래처마다 다를 수 있어 처음 등록할 때의 값만 넣는다).
async function saveProductsFromInvoice(doc) {
  const norm = (v) => String(v || '').trim().toLowerCase();
  const { data: existing, error } = await supabaseAdmin.from('products').select('name, spec').eq('owner_id', doc.owner_id);
  if (error) throw error;
  const known = new Set(existing.map((p) => `${norm(p.name)}|${norm(p.spec)}`));
  const rows = [];
  for (const it of doc.document_items || []) {
    const key = `${norm(it.name)}|${norm(it.spec)}`;
    if (!norm(it.name) || known.has(key)) continue;
    known.add(key);
    rows.push({ owner_id: doc.owner_id, name: it.name.trim(), spec: (it.spec || '').trim(), unit: '', unit_price: Number(it.unit_price) || 0, memo: '' });
  }
  if (rows.length) {
    const { error: insErr } = await supabaseAdmin.from('products').insert(rows);
    if (insErr) throw insErr;
  }
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
      // 품목별 비고칸은 화면에서 없앴으므로, PDF 불러오기 등으로 남아 있는 보이지 않는 값이 국세청에 가지 않게 비운다.
      remark: '',
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

  const supplierName = (doc.supplier || {}).name || '공급자';
  const receiver = (doc.customer || {}).email;

  // 공급받는자 발행안내 메일은 팝빌이 invoiceeEmail1로 자동 발송하며 끌 수 없다(법정 전송). 제목만 버디빌로 지정한다.
  taxinvoiceService.registIssue(
    CORP_NUM,
    taxinvoice,
    false, // writeSpecification
    true, // forceIssue: 발행 유예/보류 거래처라도 강제 발행
    '', // memo
    issueMailSubject(supplierName),
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

      // 팝빌 공급자 발행알림(TAX_ISSUE_INVOICER)은 꺼져 있고 켜도 팝빌 양식이라, 공급자 사본은 버디빌이 직접 보낸다.
      const supplierMail = await sendBrandedTaxinvoiceEmail(
        { ...doc, popbill_nts_confirm_num: ntsConfirmNum },
        (doc.supplier || {}).email,
        { toSupplier: true }
      );
      if (!supplierMail.sent) console.error('[supplier-mail]', doc.doc_no, supplierMail.reason);

      await saveCustomerFromInvoice(doc).catch((e) => console.error('[auto-customer]', doc.doc_no, e.message));
      await saveProductsFromInvoice(doc).catch((e) => console.error('[auto-product]', doc.doc_no, e.message));

      res.json({
        ok: true,
        ntsConfirmNum,
        code: result.code,
        message: result.message,
        walletBalance: newBalance,
        emailSent: !!receiver,
        emailError: receiver ? undefined : '공급받는자 이메일이 입력되지 않았습니다.',
        supplierEmailSent: supplierMail.sent,
        supplierEmailError: supplierMail.sent ? undefined : supplierMail.reason,
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
    .select('doc_no, popbill_status, popbill_nts_confirm_num, created_by, supplier, customer, issue_date, supply_total, tax_total, grand_total')
    .eq('id', documentId)
    .single();

  if (!doc || doc.created_by !== req.user.id) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (doc.popbill_status !== 'ISSUED') return res.status(409).json({ error: '아직 발행되지 않았습니다.' });

  const receiver = email || (doc.customer || {}).email;
  const toSupplier = !!receiver && receiver.trim().toLowerCase() === String((doc.supplier || {}).email || '').trim().toLowerCase();
  const result = await sendBrandedTaxinvoiceEmail(doc, receiver, { toSupplier });
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
