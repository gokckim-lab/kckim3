import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { deleteDocument, fetchDocuments } from '../lib/documents';
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
  const [list, setList] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!type) return;
    setLoading(true);
    fetchDocuments(type).then(setList).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  };
  useEffect(load, [type]);

  const remove = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 문서를 삭제할까요?')) return;
    await deleteDocument(id);
    load();
  };

  if (!type) return null;
  const label = DOC_TYPE_LABEL[type];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">{label} 목록</h1>
        <button onClick={() => navigate(`/documents/${type}/new`)}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800">+ 새 {label}</button>
      </div>

      {loading ? <div className="text-slate-400 text-sm">불러오는 중...</div> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
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
                <tr><td colSpan={6} className="p-6 text-center text-slate-400">등록된 {label}가 없습니다.</td></tr>
              )}
              {list.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/documents/${type}/${d.id}`)}>
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
