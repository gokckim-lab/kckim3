import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer } from '../lib/customers';
import type { CustomerRecord } from '../types';
import BizCardUpload from '../components/BizCardUpload';

const emptyDraft = () => ({
  biz_no: '', name: '', ceo: '', address: '', biz_type: '', biz_item: '', email: '', tel: '', contact: '', memo: '',
});

export default function Customers() {
  const { user } = useAuth();
  const notify = useToast();
  const [list, setList] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => fetchCustomers().then(setList).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k: keyof ReturnType<typeof emptyDraft>, v: string) => setDraft({ ...draft, [k]: v });

  const submit = async () => {
    if (!user) return;
    if (!draft.name.trim()) return notify('거래처명을 입력해주세요.', 'warning');
    try {
      if (editingId) {
        await updateCustomer(editingId, draft);
        notify('거래처 정보를 수정했습니다.', 'success');
      } else {
        await createCustomer(user.id, draft);
        notify('거래처를 등록했습니다.', 'success');
      }
      setDraft(emptyDraft());
      setEditingId(null);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const edit = (c: CustomerRecord) => {
    setEditingId(c.id);
    setDraft({ biz_no: c.biz_no, name: c.name, ceo: c.ceo, address: c.address, biz_type: c.biz_type, biz_item: c.biz_item, email: c.email, tel: c.tel, contact: c.contact, memo: c.memo });
  };

  const remove = async (id: string) => {
    if (!confirm('이 거래처를 삭제할까요?')) return;
    await deleteCustomer(id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-3 gap-6">
      <div className="col-span-1 bg-white rounded-xl border border-slate-200 p-4 h-fit">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">{editingId ? '거래처 수정' : '새 거래처'}</h3>
          <BizCardUpload label="거래처" onExtracted={(f) => setDraft({
            ...draft,
            biz_no: f.bizNo ?? draft.biz_no, name: f.name ?? draft.name, ceo: f.ceo ?? draft.ceo,
            address: f.address ?? draft.address, biz_type: f.bizType ?? draft.biz_type, biz_item: f.bizItem ?? draft.biz_item,
            email: f.email ?? draft.email, tel: f.tel ?? draft.tel,
          })} />
        </div>
        {[
          ['name', '거래처명'], ['biz_no', '사업자등록번호'], ['ceo', '대표자'], ['address', '주소'],
          ['biz_type', '업태'], ['biz_item', '종목'], ['contact', '담당자'], ['tel', '전화번호'], ['email', '이메일'], ['memo', '메모'],
        ].map(([k, label]) => (
          <label key={k} className="text-xs text-slate-500 flex flex-col gap-1 mb-2">
            {label}
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              value={(draft as any)[k]} onChange={(e) => set(k as any, e.target.value)} />
          </label>
        ))}
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
        <h1 className="text-xl font-bold text-slate-800 mb-3">거래처 목록</h1>
        {loading ? <div className="text-slate-400 text-sm">불러오는 중...</div> : (
          <div className="space-y-2">
            {list.length === 0 && <div className="text-slate-400 text-sm">등록된 거래처가 없습니다.</div>}
            {list.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800">{c.name} <span className="text-xs text-slate-400 ml-1">{c.biz_no}</span></div>
                  <div className="text-xs text-slate-500">{c.ceo} · {c.address}</div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => edit(c)} className="text-blue-600 hover:underline">수정</button>
                  <button onClick={() => remove(c.id)} className="text-rose-600 hover:underline">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
