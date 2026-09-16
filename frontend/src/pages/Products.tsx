import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchProducts, createProduct, updateProduct, deleteProduct } from '../lib/products';
import type { ProductRecord } from '../types';

const emptyDraft = () => ({ name: '', spec: '', unit: '', unit_price: 0, memo: '' });

export default function Products() {
  const { user } = useAuth();
  const notify = useToast();
  const [list, setList] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => fetchProducts().then(setList).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!user) return;
    if (!draft.name.trim()) return notify('품목명을 입력해주세요.', 'warning');
    try {
      if (editingId) {
        await updateProduct(editingId, draft);
        notify('품목을 수정했습니다.', 'success');
      } else {
        await createProduct(user.id, draft);
        notify('품목을 등록했습니다.', 'success');
      }
      setDraft(emptyDraft());
      setEditingId(null);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const edit = (p: ProductRecord) => {
    setEditingId(p.id);
    setDraft({ name: p.name, spec: p.spec, unit: p.unit, unit_price: p.unit_price, memo: p.memo });
  };

  const remove = async (id: string) => {
    if (!confirm('이 품목을 삭제할까요?')) return;
    await deleteProduct(id);
    load();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 grid grid-cols-3 gap-6">
      <div className="col-span-1 bg-white rounded-xl border border-slate-200 p-4 h-fit">
        <h3 className="font-semibold text-slate-800 mb-3">{editingId ? '품목 수정' : '새 품목'}</h3>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-2">품목명
          <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-2">규격
          <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={draft.spec}
            onChange={(e) => setDraft({ ...draft, spec: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-2">단위
          <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-2">단가
          <input type="number" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={draft.unit_price}
            onChange={(e) => setDraft({ ...draft, unit_price: Number(e.target.value) })} />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-2">메모
          <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={draft.memo}
            onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        </label>
        <div className="flex gap-2 mt-2">
          <button onClick={submit} className="flex-1 bg-slate-900 text-white rounded-md py-2 text-sm hover:bg-slate-800">
            {editingId ? '수정 저장' : '등록'}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-md">취소</button>
          )}
        </div>
      </div>

      <div className="col-span-2">
        <h1 className="text-xl font-bold text-slate-800 mb-3">품목 목록</h1>
        {loading ? <div className="text-slate-400 text-sm">불러오는 중...</div> : (
          <div className="space-y-2">
            {list.length === 0 && <div className="text-slate-400 text-sm">등록된 품목이 없습니다.</div>}
            {list.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">{p.name} <span className="text-xs text-slate-400 ml-1">{p.spec}</span></div>
                  <div className="text-xs text-slate-500">단가 {p.unit_price.toLocaleString('ko-KR')}원 / {p.unit}</div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => edit(p)} className="text-blue-600 hover:underline">수정</button>
                  <button onClick={() => remove(p.id)} className="text-rose-600 hover:underline">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
