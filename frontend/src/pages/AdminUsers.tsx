import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchSubscribers } from '../lib/admin';
import type { Subscriber } from '../lib/admin';

type SortKey = 'created_at' | 'balance' | 'last_sign_in_at' | 'name' | 'email';

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name', label: '회사명(가나다순)' },
  { key: 'email', label: '이메일(알파벳순)' },
  { key: 'created_at', label: '가입일' },
  { key: 'last_sign_in_at', label: '최근 활동일' },
  { key: 'balance', label: '잔액', align: 'right' },
];

export default function AdminUsers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const notify = useToast();
  const [list, setList] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = async () => {
    setLoading(true);
    try {
      setList(await fetchSubscribers());
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const sorted = useMemo(() => {
    const arr = [...list];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'balance') {
        cmp = a.balance - b.balance;
      } else if (sortKey === 'created_at' || sortKey === 'last_sign_in_at') {
        const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
        const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
        cmp = av - bv;
      } else {
        cmp = (a[sortKey] || '').localeCompare(b[sortKey] || '', 'ko');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [list, sortKey, sortDir]);

  const clickSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // 잔액/가입일/최근활동은 큰 값(최신/많음) 먼저, 이름/이메일은 ㄱ~/a~ 부터
      setSortDir(key === 'name' || key === 'email' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString('ko-KR') : '-');

  if (authLoading) return null;
  if (!isAdmin) {
    return <div className="max-w-2xl mx-auto p-10 text-center text-slate-400">관리자만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">전체 가입자 ({list.length}명)</h1>
        <button onClick={load} className="text-sm text-slate-500 hover:text-slate-800">새로고침</button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => clickSort(c.key)}
                    className={`p-3 cursor-pointer select-none hover:text-slate-800 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-400">가입자가 없습니다.</td></tr>
              )}
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-700">
                    {s.name || '(회사명 미입력)'}
                    {s.is_admin && <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-slate-900 text-white">관리자</span>}
                  </td>
                  <td className="p-3 text-slate-500">{s.email}</td>
                  <td className="p-3 text-slate-500">{fmtDate(s.created_at)}</td>
                  <td className="p-3 text-slate-500">{fmtDate(s.last_sign_in_at)}</td>
                  <td className="p-3 text-right">{s.balance.toLocaleString('ko-KR')}P</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">※ "최근 활동일"은 최근 로그인 시각 기준입니다. 열 제목을 클릭하면 정렬 기준/방향이 바뀝니다.</p>
    </div>
  );
}
