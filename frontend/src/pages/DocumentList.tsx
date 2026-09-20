import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import GuestBanner from '../components/GuestBanner';
import { getDocStore } from '../lib/docStore';
import { issueTaxInvoice } from '../lib/backendApi';
import type { DocType, DocumentRecord } from '../types';
import { DOC_TYPE_LABEL } from '../types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  confirmed: 'bg-blue-100 text-blue-700',
  canceled: 'bg-rose-100 text-rose-700',
};

export default function DocumentList() {
  const { type } = useParams<{ type: DocType }>();
  const navigate = useNavigate();
  const notify = useToast();
  const { user } = useAuth();
  const store = getDocStore(user?.id ?? null);
  const [list, setList] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const load = () => {
    if (!type) return;
    setLoading(true);
    store.list(type).then(setList).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  };
  useEffect(load, [type, user?.id]);
  useEffect(() => { setSelected(new Set()); }, [type, list.length]);

  const remove = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 문서를 삭제할까요?')) return;
    await store.remove(id);
    load();
  };

  const issuableIds = list.filter((d) => d.popbill_status !== 'ISSUED').map((d) => d.id);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === issuableIds.length ? new Set() : new Set(issuableIds)));
  };

  const bulkIssue = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}건을 세금계산서로 발행할까요? (건당 포인트가 차감됩니다)`)) return;
    setBulkIssuing(true);
    setBulkProgress({ done: 0, total: ids.length });
    let successCount = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await issueTaxInvoice(id);
        successCount += 1;
      } catch (e: any) {
        const doc = list.find((d) => d.id === id);
        failed.push(`${doc?.doc_no ?? id}: ${e.message}`);
      }
      setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBulkIssuing(false);
    setSelected(new Set());
    if (failed.length === 0) {
      notify(`${successCount}건 발행 완료되었습니다.`, 'success');
    } else {
      notify(`${successCount}건 발행 완료, ${failed.length}건 실패: ${failed.join(' / ')}`, 'warning');
    }
    load();
  };

  if (!type) return null;
  const label = DOC_TYPE_LABEL[type];
  const isTaxInvoice = type === 'tax_invoice';
  // 체험(비로그인) 상태에서는 발행 자체가 불가능하므로 일괄 발행용 선택 칸을 숨긴다.
  const showSelect = isTaxInvoice && !!user;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <GuestBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{label} 목록</h1>
        <div className="flex items-center gap-2">
          {showSelect && selected.size > 0 && (
            <button onClick={bulkIssue} disabled={bulkIssuing}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm hover:bg-emerald-700 disabled:opacity-60">
              {bulkIssuing ? `발행 중... (${bulkProgress.done}/${bulkProgress.total})` : `선택 발행 (${selected.size}건)`}
            </button>
          )}
          <button onClick={() => navigate(`/documents/${type}/new`)}
            className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800">+ 새 {label}</button>
        </div>
      </div>

      {loading ? <div className="text-slate-400 text-sm">불러오는 중...</div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                {showSelect && (
                  <th className="p-3 w-10">
                    {issuableIds.length > 0 && (
                      <input type="checkbox" checked={selected.size === issuableIds.length}
                        onChange={toggleAll} onClick={(e) => e.stopPropagation()} />
                    )}
                  </th>
                )}
                <th className="p-3 text-left">문서번호</th>
                <th className="p-3 text-left">거래처</th>
                <th className="p-3 text-left">작성일</th>
                <th className="p-3 text-right">합계금액</th>
                <th className="p-3 text-left">상태</th>
                <th className="p-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={showSelect ? 7 : 6} className="p-6 text-center text-slate-400">등록된 {label}가 없습니다.</td></tr>
              )}
              {list.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/documents/${type}/${d.id}`)}>
                  {showSelect && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {d.popbill_status !== 'ISSUED' && (
                        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} />
                      )}
                    </td>
                  )}
                  <td className="p-3 font-medium text-slate-700">{d.doc_no}</td>
                  <td className="p-3">{d.customer?.name || '-'}</td>
                  <td className="p-3 text-slate-500">{d.issue_date}</td>
                  <td className="p-3 text-right">{d.grand_total.toLocaleString('ko-KR')}원</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[d.status]}`}>
                      {d.status === 'draft' ? '임시저장' : d.status === 'confirmed' ? '확정' : '취소'}
                    </span>
                    {d.type === 'tax_invoice' && d.popbill_status === 'ISSUED' && (
                      <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">발행완료</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={(e) => remove(d.id, e)} className="text-slate-400 hover:text-rose-500 text-xs">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
