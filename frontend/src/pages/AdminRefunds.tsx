import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchPendingRefunds, approveRefund, rejectRefund } from '../lib/wallet';
import { supabase } from '../lib/supabaseClient';
import type { WalletTransaction } from '../types/wallet';

export default function AdminRefunds() {
  const { isAdmin, loading: authLoading } = useAuth();
  const notify = useToast();
  const [list, setList] = useState<WalletTransaction[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchPendingRefunds();
      setList(rows);
      const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
      if (ownerIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, name').in('id', ownerIds);
        setNames(Object.fromEntries((data ?? []).map((p: any) => [p.id, p.name || '(회사명 미입력)'])));
      }
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const approve = async (id: string) => {
    if (!confirm('해당 계좌로 실제 입금을 완료하셨나요? 승인하면 그 즉시 잔액에서 차감됩니다.')) return;
    setBusyId(id);
    try {
      await approveRefund(id);
      notify('승인 완료. 잔액에서 차감되었습니다.', 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = prompt('반려 사유를 입력하세요 (선택)') ?? '';
    setBusyId(id);
    try {
      await rejectRefund(id, reason);
      notify('반려되었습니다.', 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) return null;
  if (!isAdmin) {
    return <div className="max-w-2xl mx-auto p-10 text-center text-slate-400">관리자만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold text-slate-800 mb-1">환불 승인 대기 목록</h1>
      <p className="text-xs text-slate-400 mb-4">계좌로 실제 입금을 먼저 해주신 뒤 승인 버튼을 눌러주세요. 승인 즉시 잔액에서 차감됩니다.</p>
      {loading ? <div className="text-slate-400 text-sm">불러오는 중...</div> : (
        <div className="space-y-2">
          {list.length === 0 && <div className="text-slate-400 text-sm">대기중인 환불 신청이 없습니다.</div>}
          {list.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-800">{names[t.owner_id] ?? t.owner_id} · {t.amount.toLocaleString('ko-KR')}원</div>
                <div className="text-xs text-slate-500 mt-0.5">환불계좌: {t.refund_account_info || '-'}</div>
                <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString('ko-KR')}</div>
              </div>
              <div className="flex gap-2">
                <button disabled={busyId === t.id} onClick={() => approve(t.id)}
                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60">승인</button>
                <button disabled={busyId === t.id} onClick={() => reject(t.id)}
                  className="px-3 py-1.5 text-xs border border-rose-300 text-rose-600 rounded-md hover:bg-rose-50 disabled:opacity-60">반려</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
