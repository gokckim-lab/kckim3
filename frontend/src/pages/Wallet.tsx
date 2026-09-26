import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchProfile } from '../lib/profile';
import { fetchMyWallet, fetchMyTransactions, requestDeposit, requestRefund } from '../lib/wallet';
import { requestNicePayVirtualAccount } from '../lib/nicepay';
import type { PartyInfo } from '../types';
import NicePayChargeButton from '../components/NicePayChargeButton';
import type { Wallet as WalletType, WalletTransaction } from '../types/wallet';

const PRESET_AMOUNTS = [10000, 30000, 50000, 100000];

const TYPE_LABEL: Record<string, string> = { deposit_request: '충전 신청', issue_deduct: '세금계산서 발행 차감', refund: '환불', refund_request: '환불 신청' };
const STATUS_LABEL: Record<string, string> = { pending: '승인 대기', approved: '완료', rejected: '반려' };
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

export default function Wallet() {
  const notify = useToast();
  const { user } = useAuth();
  const [missingInvoiceInfo, setMissingInvoiceInfo] = useState(false);
  const [profile, setProfile] = useState<PartyInfo | null>(null);
  const [params, setParams] = useSearchParams();
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [amount, setAmount] = useState(50000);
  const [depositorName, setDepositorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cardAmount, setCardAmount] = useState(50000);
  const [vaAmount, setVaAmount] = useState(50000);
  const [vaIssuing, setVaIssuing] = useState(false);
  const [vaHolder, setVaHolder] = useState('');
  const [vaResult, setVaResult] = useState<{ bankName: string; accountNum: string; expireDate: string; holder: string; amount: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundAccountInfo, setRefundAccountInfo] = useState('');
  const [refunding, setRefunding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([fetchMyWallet(), fetchMyTransactions()]);
      setWallet(w);
      setTxs(t);
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // 가상계좌/무통장 충전분은 카드전표 같은 자동 증빙이 없어 세금계산서를 발급해야 하므로,
  // 사업자등록번호와 이메일이 회사정보에 있는지 미리 확인해 안내한다.
  useEffect(() => {
    if (!user) return;
    fetchProfile(user.id)
      .then((p) => {
        setProfile(p);
        setMissingInvoiceInfo(!p.bizNo.trim() || !p.email.trim());
        setVaHolder((prev) => prev || p.name.trim());
      })
      .catch(() => {});
  }, [user?.id]);

  const confirmInvoiceInfo = () =>
    !missingInvoiceInfo ||
    confirm('회사정보에 사업자등록번호 또는 이메일이 없어 세금계산서를 발급받을 수 없습니다. (카드 충전은 카드전표가 증빙이라 해당 없음) 그래도 계속 진행할까요?');

  // 나이스페이 결제 후 backend가 /wallet?nicepay=success|fail 로 돌려보낸다.
  useEffect(() => {
    const status = params.get('nicepay');
    if (!status) return;
    if (status === 'success') {
      const amt = params.get('amount');
      notify(`카드 충전이 완료됐습니다${amt ? ` (${Number(amt).toLocaleString('ko-KR')}원)` : ''}.`, 'success');
      load();
    } else if (status === 'fail') {
      notify(`카드 충전에 실패했습니다: ${params.get('reason') || '알 수 없는 오류'}`, 'error');
    }
    setParams((prev) => { prev.delete('nicepay'); prev.delete('amount'); prev.delete('reason'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 가상계좌 발급 후 backend가 /wallet?vbank=success|fail 로 돌려보낸다. 발급(채번)만 된 것이고,
  // 실제 입금 완료는 나중에 웹훅으로 따로 반영되므로 여기서는 잔액을 다시 불러오지 않는다.
  useEffect(() => {
    const status = params.get('vbank');
    if (!status) return;
    if (status === 'success') {
      setVaResult({
        bankName: params.get('bankName') || '',
        accountNum: params.get('accountNum') || '',
        expireDate: params.get('expireDate') || '',
        holder: params.get('holder') || '',
        amount: Number(params.get('amount') || 0),
      });
    } else if (status === 'fail') {
      notify(`가상계좌 발급에 실패했습니다: ${params.get('reason') || '알 수 없는 오류'}`, 'error');
    }
    setParams((prev) => {
      ['vbank', 'bankName', 'accountNum', 'expireDate', 'holder', 'amount'].forEach((k) => prev.delete(k));
      return prev;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 나이스페이 결제창의 "현금영수증 신청" 휴대폰번호 입력을 회사정보 전화번호로 미리 채워준다.
  // 하이픈이 있으면 나이스페이가 거부하므로 숫자만 남긴다.
  const buyerInfo = profile
    ? { buyerName: profile.name || undefined, buyerTel: profile.tel?.replace(/\D/g, '') || undefined, buyerEmail: profile.email || undefined }
    : undefined;

  const issueVa = async () => {
    if (!user) return;
    if (vaAmount <= 0) return notify('충전 금액을 입력해주세요.', 'warning');
    if (!vaHolder.trim()) return notify('예금주명을 입력해주세요.', 'warning');
    if (!confirmInvoiceInfo()) return;
    setVaIssuing(true);
    try {
      await requestNicePayVirtualAccount(vaAmount, user.id, vaHolder.trim(), (message) => {
        notify(message, 'error');
        setVaIssuing(false);
      }, buyerInfo);
      // 정상 흐름이면 나이스페이 결제창으로 이동하면서 이 페이지를 벗어난다.
    } catch (e: any) {
      notify(e.message, 'error');
      setVaIssuing(false);
    }
  };

  const fmtVaExpire = (v: string) => (v ? new Date(v).toLocaleString('ko-KR') : '-');

  const submit = async () => {
    if (amount <= 0) return notify('충전 금액을 입력해주세요.', 'warning');
    if (!depositorName.trim()) return notify('입금자명을 입력해주세요.', 'warning');
    if (!confirmInvoiceInfo()) return;
    setSubmitting(true);
    try {
      await requestDeposit(amount, depositorName);
      notify('충전 신청이 접수되었습니다. 입금 확인 후 관리자가 승인하면 잔액에 반영됩니다.', 'success');
      setDepositorName('');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRefund = async () => {
    if (refundAmount <= 0) return notify('환불 금액을 입력해주세요.', 'warning');
    if (!refundAccountInfo.trim()) return notify('환불받을 계좌 정보를 입력해주세요.', 'warning');
    setRefunding(true);
    try {
      await requestRefund(refundAmount, refundAccountInfo);
      notify('환불 신청이 접수되었습니다. 확인 후 계좌로 입금해드리며, 그때 잔액에서 차감됩니다.', 'success');
      setRefundAmount(0);
      setRefundAccountInfo('');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">포인트 지갑</h1>
      <p className="text-sm text-slate-500">
        견적서 · 주문서 · 거래명세서는 무료입니다. 세금계산서를 팝빌로 <b>발행</b>할 때만 건당 포인트가 차감됩니다.
        무통장입금으로 충전 신청을 하면 확인 후 반영됩니다.
      </p>

      {missingInvoiceInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            가상계좌·무통장입금으로 충전하시면 충전분에 대한 <b>세금계산서를 발급</b>해드립니다.
            발급을 위해 <b>사업자등록번호와 이메일</b>을 회사정보에 입력해주세요. (카드 충전은 카드전표가 증빙이라 필요 없습니다)
          </span>
          <Link to="/profile" className="shrink-0 bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800">회사정보 입력</Link>
        </div>
      )}

      <div className="bg-slate-900 text-white rounded-xl p-6 flex items-center justify-between">
        <span className="text-slate-300">현재 잔액</span>
        <span className="text-3xl font-bold">{loading ? '...' : (wallet?.balance ?? 0).toLocaleString('ko-KR')} P</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-1">카드로 즉시 충전</h3>
        <p className="text-xs text-slate-400 mb-3">결제 승인 즉시 잔액에 자동 반영됩니다 (나이스페이).</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_AMOUNTS.map((v) => (
            <button key={v} type="button" onClick={() => setCardAmount(v)}
              className={`px-3 py-1.5 rounded-md text-sm border ${cardAmount === v ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {v.toLocaleString('ko-KR')}원
            </button>
          ))}
          <input type="number" step={1000} className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={cardAmount === 0 ? '' : cardAmount}
            onChange={(e) => setCardAmount(e.target.value === '' ? 0 : Number(e.target.value))} />
        </div>
        <NicePayChargeButton amount={cardAmount} buyer={buyerInfo} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-1">가상계좌로 충전 (자동 반영)</h3>
        <p className="text-xs text-slate-400 mb-3">충전 신청마다 1회용 입금 계좌가 발급됩니다. 그 계좌로 입금하면 관리자 승인 없이 자동으로 잔액에 반영되며, 사업자 회원께는 세금계산서를 발급해드립니다.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_AMOUNTS.map((v) => (
            <button key={v} type="button" onClick={() => setVaAmount(v)}
              className={`px-3 py-1.5 rounded-md text-sm border ${vaAmount === v ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {v.toLocaleString('ko-KR')}원
            </button>
          ))}
          <input type="number" step={1000} className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            value={vaAmount === 0 ? '' : vaAmount}
            onChange={(e) => setVaAmount(e.target.value === '' ? 0 : Number(e.target.value))} />
        </div>
        <input className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm mb-3" value={vaHolder}
          onChange={(e) => setVaHolder(e.target.value)} placeholder="예금주명 (보통 우리 회사 상호)" />
        <button onClick={issueVa} disabled={vaIssuing}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800 disabled:opacity-60">
          {vaIssuing ? '결제창 여는 중...' : `${vaAmount.toLocaleString('ko-KR')}원 가상계좌 발급받기`}
        </button>
        {vaResult && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-sm text-emerald-800">
            <b>{vaResult.bankName} {vaResult.accountNum}</b>로 <b>{vaResult.amount.toLocaleString('ko-KR')}원</b> 입금해주세요.
            <br />입금 기한: {fmtVaExpire(vaResult.expireDate)}까지 (이후 만료)
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-3">충전 신청 (무통장입금 · 관리자 확인 필요)</h3>
        <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mb-3 text-sm text-slate-700">
          입금 계좌: <b>신한은행 110-429-632870</b> (예금주: 김기천)
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            충전 금액
            <input type="number" step={10000} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              value={amount === 0 ? '' : amount}
              onChange={(e) => setAmount(e.target.value === '' ? 0 : Number(e.target.value))} />
          </label>
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            입금자명
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)} placeholder="실제 입금하시는 분 성함" />
          </label>
        </div>
        <button onClick={submit} disabled={submitting}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800 disabled:opacity-60">
          {submitting ? '신청 중...' : '충전 신청'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-1">포인트 환불 신청</h3>
        <p className="text-xs text-slate-400 mb-3">
          신청 후 확인되면 입력하신 계좌로 입금해드리며, 그 시점에 잔액에서 차감됩니다. 잔액을 임의로 없애지 않습니다.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            환불 금액
            <input type="number" step={10000} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              value={refundAmount === 0 ? '' : refundAmount}
              onChange={(e) => setRefundAmount(e.target.value === '' ? 0 : Number(e.target.value))} />
          </label>
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            환불받을 계좌
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={refundAccountInfo}
              onChange={(e) => setRefundAccountInfo(e.target.value)} placeholder="은행명 계좌번호 예금주" />
          </label>
        </div>
        <button onClick={submitRefund} disabled={refunding}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800 disabled:opacity-60">
          {refunding ? '신청 중...' : '환불 신청'}
        </button>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-2">거래 내역</h3>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="p-2 text-left">일시</th>
                <th className="p-2 text-left">구분</th>
                <th className="p-2 text-right">금액</th>
                <th className="p-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">내역이 없습니다.</td></tr>}
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-500">{new Date(t.created_at).toLocaleString('ko-KR')}</td>
                  <td className="p-2">{TYPE_LABEL[t.type]}</td>
                  <td className="p-2 text-right">{t.type === 'deposit_request' || t.type === 'refund' ? '+' : '-'}{t.amount.toLocaleString('ko-KR')}</td>
                  <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
