import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PartyForm from '../components/PartyForm';
import ItemTable from '../components/ItemTable';
import PrintableDocument from '../components/PrintableDocument';
import OrderDocUpload from '../components/OrderDocUpload';
import GuestBanner from '../components/GuestBanner';
import { fetchCustomers } from '../lib/customers';
import { fetchProfile } from '../lib/profile';
import { NEXT_TYPE } from '../lib/documents';
import { getDocStore } from '../lib/docStore';
import { loadGuestSupplier, saveGuestSupplier } from '../lib/guestStore';
import { issueTaxInvoice, getTaxInvoicePopupUrl, resendTaxInvoiceEmail } from '../lib/backendApi';
import { fetchMyWallet } from '../lib/wallet';
import type { OrderDocResult } from '../lib/orderDocExtract';
import type { CustomerRecord, DocType, DocumentItem, DocumentRecord, PartyInfo } from '../types';
import { DOC_TYPE_LABEL, emptyParty } from '../types';

// toISOString()은 UTC 기준이라 한국 시간 새벽(0~9시)에는 작성일이 하루 전으로 찍힌다.
const todayLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function DocumentEditor() {
  const { type, id } = useParams<{ type: DocType; id: string }>();
  const [params] = useSearchParams();
  const sourceId = params.get('sourceId');
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useToast();
  const store = getDocStore(user?.id ?? null);

  const isNew = !id || id === 'new';

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [supplier, setSupplier] = useState<PartyInfo>(emptyParty());
  const [customer, setCustomer] = useState<PartyInfo>(emptyParty());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [issueDate, setIssueDate] = useState(() => todayLocal());
  const [dueDate, setDueDate] = useState('');
  const [memo, setMemo] = useState('');
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCustomers().then(setCustomers).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!type) return;
    setLoading(true);
    (async () => {
      try {
        // 같은 DocumentEditor 컴포넌트가 마운트된 채로 다른 문서로 이동할 수 있으므로
        // (예: 변환 버튼, URL 직접 이동) 매번 이전 화면의 상태를 먼저 완전히 비운다.
        // 특히 doc을 비워두지 않으면 "새 문서"인데 저장 시 이전 문서를 덮어쓰는 버그가 생긴다.
        setDoc(null);
        setCustomerId(null);
        setItems([]);
        setMemo('');
        setIssueDate(todayLocal());
        setDueDate('');

        if (!isNew && id) {
          const d = await store.get(id);
          setDoc(d);
          setSupplier(d.supplier);
          setCustomer(d.customer);
          setCustomerId(d.customer_id);
          setItems(d.document_items ?? []);
          setIssueDate(d.issue_date);
          setDueDate(d.due_date ?? '');
          setMemo(d.memo);
        } else if (sourceId) {
          const src = await store.get(sourceId);
          setSupplier(src.supplier);
          setCustomer(src.customer);
          setCustomerId(src.customer_id);
          // id/document_id는 원본 문서(견적서 등) 것이므로 그대로 두면 안 된다. 특히 id를 값 없이
          // (undefined로) 남겨두면 supabase-js가 insert 시 "id 컬럼에 값을 넣겠다"고 선언해버려서
          // 실제로는 NULL이 들어가 not-null 제약조건 위반(23502)으로 저장이 통째로 실패한다.
          // 반드시 키 자체를 지워서 DB가 새 id를 기본값(gen_random_uuid())으로 채우게 해야 한다.
          setItems((src.document_items ?? []).map(({ id: _id, document_id: _documentId, ...rest }, idx) => ({ ...rest, sort_order: idx })));
          setMemo(src.memo);
        } else {
          setSupplier(user ? await fetchProfile(user.id) : loadGuestSupplier());
          setCustomer(emptyParty());
        }
      } catch (e: any) {
        notify(e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [type, id, sourceId, user?.id]);

  useEffect(() => {
    if (type === 'tax_invoice' && user) {
      fetchMyWallet().then((w) => setWalletBalance(w.balance)).catch(() => setWalletBalance(null));
    }
  }, [type, user?.id]);

  const pickCustomer = (cid: string) => {
    setCustomerId(cid || null);
    const c = customers.find((x) => x.id === cid);
    if (c) {
      setCustomer({
        bizNo: c.biz_no, name: c.name, ceo: c.ceo, address: c.address, bizType: c.biz_type,
        bizItem: c.biz_item, email: c.email, tel: c.tel, contact: c.contact, purposeType: '영수', taxType: '과세',
      });
    }
  };

  const handleOrderDocImport = (result: OrderDocResult) => {
    // 추출 못한 항목(빈 문자열)으로 기존 값을 덮어쓰지 않도록 채워진 필드만 병합한다.
    const merge = (base: PartyInfo, extracted: Partial<PartyInfo>): PartyInfo => {
      const next = { ...base };
      for (const [k, v] of Object.entries(extracted)) {
        if (v && String(v).trim()) (next as any)[k] = v;
      }
      return next;
    };
    if (Object.values(result.customer).some((v) => v && String(v).trim())) {
      setCustomer((prev) => merge(prev, result.customer));
      setCustomerId(null); // 불러온 정보로 새로 채웠으니 "등록된 거래처" 선택은 해제한다
    }
    if (Object.values(result.supplier).some((v) => v && String(v).trim())) {
      setSupplier((prev) => merge(prev, result.supplier));
    }
    if (result.items.length > 0) {
      setItems(result.items);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!type) return false;
    if (!customer.name.trim()) { notify('공급받는자(거래처) 상호를 입력해주세요.', 'warning'); return false; }
    if (items.length === 0) { notify('품목을 1개 이상 추가해주세요.', 'warning'); return false; }
    setSaving(true);
    try {
      const draft = {
        type, customer_id: customerId, supplier, customer, issue_date: issueDate,
        due_date: dueDate || null, memo, items, source_document_id: doc?.source_document_id ?? sourceId ?? null,
      };
      if (doc) {
        await store.update(doc.id, draft);
        if (!user) saveGuestSupplier(supplier);
        notify('저장되었습니다.', 'success');
        const refreshed = await store.get(doc.id);
        setDoc(refreshed);
      } else {
        const created = await store.create(draft);
        if (!user) saveGuestSupplier(supplier);
        notify('문서를 생성했습니다.', 'success');
        navigate(`/documents/${type}/${created.id}`, { replace: true });
      }
      return true;
    } catch (e: any) {
      notify(e.message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 체험 모드에서는 세금계산서를 발행할 수 없다. 작성 중인 내용을 먼저 브라우저에 저장해두면
  // 가입/로그인 직후 계정으로 자동 이전되므로, 저장에 성공했을 때만 로그인 화면으로 보낸다.
  const goSignupToIssue = async () => {
    if (customer.name.trim() && items.length > 0 && !(await save())) return;
    navigate('/login?next=/documents/tax_invoice');
  };

  const doIssue = async () => {
    if (!doc) return;
    setIssuing(true);
    try {
      const result = await issueTaxInvoice(doc.id);
      notify('세금계산서가 발행되었습니다.', 'success');
      if (result.emailSent) {
        notify(`공급받는자(${doc.customer.email})에게 이메일을 발송했습니다.`, 'success');
      } else {
        notify(`이메일 자동발송에 실패했습니다: ${result.emailError ?? '알 수 없는 오류'}. 아래 "이메일 재발송" 버튼으로 다시 시도할 수 있습니다.`, 'warning');
      }
      const refreshed = await store.get(doc.id);
      setDoc(refreshed);
      fetchMyWallet().then((w) => setWalletBalance(w.balance)).catch(() => {});
    } catch (e: any) {
      notify(`발행 실패: ${e.message}`, 'error');
    } finally {
      setIssuing(false);
    }
  };

  const doResendEmail = async () => {
    if (!doc) return;
    setResendingEmail(true);
    try {
      await resendTaxInvoiceEmail(doc.id, customer.email);
      notify(`${customer.email}로 세금계산서 이메일을 재발송했습니다.`, 'success');
    } catch (e: any) {
      notify(`이메일 발송 실패: ${e.message}`, 'error');
    } finally {
      setResendingEmail(false);
    }
  };

  const viewIssued = async () => {
    if (!doc) return;
    try {
      const url = await getTaxInvoicePopupUrl(doc.id);
      window.open(url, '_blank');
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const convertNext = () => {
    if (!doc || !type) return;
    const next = NEXT_TYPE[type];
    if (!next) return;
    navigate(`/documents/${next}/new?sourceId=${doc.id}`);
  };

  if (!type) return null;
  if (loading) return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;

  const label = DOC_TYPE_LABEL[type];
  const nextType = NEXT_TYPE[type];
  const isTaxInvoice = type === 'tax_invoice';
  const issued = doc?.popbill_status === 'ISSUED';
  const issuePrice = Number(import.meta.env.VITE_ISSUE_PRICE ?? 200);
  const insufficientBalance = isTaxInvoice && walletBalance !== null && walletBalance < issuePrice;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <GuestBanner />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{label} {doc ? `- ${doc.doc_no}` : '작성'}</h1>
          {isTaxInvoice && walletBalance !== null && (
            <p className={`text-xs mt-1 ${insufficientBalance ? 'text-rose-500' : 'text-slate-400'}`}>
              내 포인트 잔액: {walletBalance.toLocaleString('ko-KR')}P (발행 1건당 {issuePrice.toLocaleString('ko-KR')}P 차감)
              {insufficientBalance && ' · 잔액이 부족합니다'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {doc && <button onClick={() => window.print()} className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50">인쇄 / PDF 저장</button>}
          {doc && nextType && (
            <button onClick={convertNext} className="px-4 py-2 text-sm border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50">
              {DOC_TYPE_LABEL[nextType]}로 변환 →
            </button>
          )}
          {isTaxInvoice && doc && !issued && (
            <button onClick={doIssue} disabled={issuing || insufficientBalance}
              title={insufficientBalance ? '포인트 잔액이 부족합니다. 포인트 메뉴에서 충전해주세요.' : undefined}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60">
              {issuing ? '발행 중...' : insufficientBalance ? '포인트 부족' : '팝빌로 세금계산서 발행'}
            </button>
          )}
          {isTaxInvoice && !user && (
            <button onClick={goSignupToIssue}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
              세금계산서 발행 (가입 필요)
            </button>
          )}
          {isTaxInvoice && issued && (
            <button onClick={viewIssued} className="px-4 py-2 text-sm bg-emerald-100 text-emerald-700 rounded-md">발행된 문서 보기</button>
          )}
          {isTaxInvoice && issued && (
            <button onClick={doResendEmail} disabled={resendingEmail || !customer.email}
              title={!customer.email ? '공급받는자 이메일을 먼저 입력해주세요.' : undefined}
              className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60">
              {resendingEmail ? '발송 중...' : '이메일 재발송'}
            </button>
          )}
          <button onClick={() => { void save(); }} disabled={saving || (isTaxInvoice && issued)}
            className="px-4 py-2 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {(type === 'delivery' || type === 'tax_invoice') && !issued && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between print:hidden">
          <div className="text-sm text-blue-900">
            <div className="font-medium">거래처가 보낸 {type === 'delivery' ? '견적서·주문서' : '견적서·주문서·거래명세서'} 파일이 있나요?</div>
            <div className="text-xs text-blue-700 mt-0.5">PDF·이미지·엑셀·워드(.docx)·한글(.hwpx)을 업로드하면 거래처 정보와 품목표를 자동으로 채워줍니다.</div>
          </div>
          <OrderDocUpload label={type === 'delivery' ? '견적서/주문서' : '견적서/주문서/거래명세서'} onExtracted={handleOrderDocImport} />
        </div>
      )}

      {doc?.popbill_status === 'FAILED' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-md p-3 print:hidden">
          팝빌 발행 실패: {doc.popbill_last_error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 print:hidden">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            거래처 선택 (등록된 거래처에서 불러오기)
            <select className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={customerId ?? ''}
              onChange={(e) => pickCustomer(e.target.value)} disabled={issued}>
              <option value="">-- 직접 입력 --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500 flex flex-col gap-1">작성일
              <input type="date" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={issueDate}
                disabled={issued} onChange={(e) => setIssueDate(e.target.value)} />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">납기일
              <input type="date" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={dueDate}
                disabled={issued} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
        </div>
        <label className="text-xs text-slate-500 flex flex-col gap-1 bg-white rounded-xl border border-slate-200 p-4">
          비고
          <textarea className="border border-slate-300 rounded-md px-2 py-1.5 text-sm h-20" value={memo}
            disabled={issued} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 print:hidden">
        <PartyForm title="공급자" value={supplier} onChange={setSupplier} />
        <PartyForm title="공급받는자" value={customer} onChange={setCustomer} showTaxOptions={isTaxInvoice} />
      </div>

      <div className="print:hidden">
        <ItemTable items={items} onChange={setItems} taxType={customer.taxType} readOnly={issued} />
      </div>

      {doc && (
        <div className="pt-6">
          <PrintableDocument doc={{ ...doc, supplier, customer, document_items: items, issue_date: issueDate, due_date: dueDate, memo }} />
        </div>
      )}
    </div>
  );
}
