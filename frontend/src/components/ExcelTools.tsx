import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../context/ToastContext';
import { SPECS, dedupeKey, downloadExcel, parseExcel, type ExcelKind, type ParsedRow } from '../lib/excelIO';

type Status = 'new' | 'update' | 'same' | 'dup' | 'error';
interface PlanRow { rowNo: number; data: Record<string, any>; status: Status; note?: string; targetId?: string; patch?: Record<string, any> }

const STATUS_LABEL: Record<Status, [string, string]> = {
  new: ['새로 추가', 'bg-emerald-50 text-emerald-700'],
  update: ['기존 보완', 'bg-blue-50 text-blue-700'],
  same: ['변경 없음', 'bg-slate-100 text-slate-500'],
  dup: ['파일 내 중복', 'bg-amber-50 text-amber-700'],
  error: ['오류', 'bg-rose-50 text-rose-700'],
};

const TABLE: Record<ExcelKind, string> = { customers: 'customers', products: 'products' };
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

interface Props {
  kind: ExcelKind;
  ownerId: string;
  existing: Record<string, any>[];
  onDone: () => void;
}

export default function ExcelTools({ kind, ownerId, existing, onDone }: Props) {
  const notify = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const { title, fields } = SPECS[kind];

  // 이미 있는 항목은 기본적으로 빈 칸만 채우고, "덮어쓰기"를 켜면 엑셀 값으로 바꾼다
  // (내보낸 파일에서 단가 등을 고쳐 다시 올리는 경우).
  const plan: PlanRow[] = (() => {
    if (!parsed) return [];
    const byKey = new Map(existing.map((e) => [dedupeKey(kind, e), e]));
    const seen = new Set<string>();
    return parsed.map((r) => {
      if (r.error) return { rowNo: r.rowNo, data: r.data, status: 'error' as const, note: r.error };
      const key = dedupeKey(kind, r.data);
      if (seen.has(key)) return { rowNo: r.rowNo, data: r.data, status: 'dup' as const, note: '위쪽 줄과 같은 항목이라 건너뜀' };
      seen.add(key);
      const cur = byKey.get(key);
      if (!cur) return { rowNo: r.rowNo, data: r.data, status: 'new' as const };
      const patch = Object.fromEntries(
        Object.entries(r.data).filter(([k, v]) => {
          if (v === '' || v === 0 || k === 'name') return false;
          const old = cur[k];
          return overwrite ? String(old ?? '') !== String(v) : !String(old ?? '').trim() || old === 0;
        })
      );
      return Object.keys(patch).length
        ? { rowNo: r.rowNo, data: r.data, status: 'update' as const, targetId: cur.id, patch, note: `${Object.keys(patch).map((k) => fields.find((f) => f.key === k)?.label).join(', ')} 반영` }
        : { rowNo: r.rowNo, data: r.data, status: 'same' as const };
    });
  })();
  const count = (s: Status) => plan.filter((p) => p.status === s).length;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { rows, missingRequired } = await parseExcel(kind, file);
      if (missingRequired) {
        notify(`첫 줄(머리글)에서 '${fields.find((f) => f.required)!.label}' 칸을 찾지 못했습니다. [엑셀 양식 받기]의 머리글을 사용해주세요.`, 'error');
        return;
      }
      if (!rows.length) { notify('엑셀에 등록할 내용이 없습니다.', 'warning'); return; }
      setFileName(file.name);
      setOverwrite(false);
      setParsed(rows);
    } catch (e: any) {
      notify(`엑셀을 읽지 못했습니다: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      // 줄마다 빠진 칸이 있으면 PostgREST가 NULL을 넣으므로 모든 칸을 기본값으로 채워 보낸다.
      const blank = Object.fromEntries(fields.map((f) => [f.key, f.number ? 0 : '']));
      const inserts = plan.filter((p) => p.status === 'new').map((p) => ({ ...blank, ...p.data, owner_id: ownerId }));
      for (let i = 0; i < inserts.length; i += 500) {
        const { error } = await supabase.from(TABLE[kind]).insert(inserts.slice(i, i + 500));
        if (error) throw error;
      }
      const updates = plan.filter((p) => p.status === 'update');
      for (const u of updates) {
        const { error } = await supabase.from(TABLE[kind]).update(u.patch!).eq('id', u.targetId!);
        if (error) throw error;
      }
      notify(`${title} ${inserts.length}건 추가, ${updates.length}건 보완했습니다.`, 'success');
      setParsed(null);
      onDone();
    } catch (e: any) {
      notify(`저장 중 오류: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap';

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => downloadExcel(kind, `버디빌_${title}_양식.xlsx`, [])}>엑셀 양식 받기</button>
        <button className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>{busy && !parsed ? '읽는 중...' : '엑셀로 올리기'}</button>
        <button className={btn} disabled={!existing.length} onClick={() => downloadExcel(kind, `버디빌_${title}_${today()}.xlsx`, existing)}>엑셀로 내보내기</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {parsed && (
        <div className="mt-3 bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-sm">엑셀 미리보기 · {fileName}</h3>
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setParsed(null)}>닫기 ✕</button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs mb-2">
            {(Object.keys(STATUS_LABEL) as Status[]).filter((s) => count(s)).map((s) => (
              <span key={s} className={`px-2 py-0.5 rounded ${STATUS_LABEL[s][1]}`}>{STATUS_LABEL[s][0]} {count(s)}건</span>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 mb-2">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            이미 등록된 {title}도 엑셀 값으로 덮어쓰기 (끄면 비어 있는 칸만 채움)
          </label>
          <div className="max-h-72 overflow-auto border border-slate-100 rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="p-1.5 text-left">줄</th>
                  <th className="p-1.5 text-left">상태</th>
                  {fields.slice(0, 4).map((f) => <th key={f.key} className="p-1.5 text-left">{f.label}</th>)}
                  <th className="p-1.5 text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {plan.slice(0, 200).map((p) => (
                  <tr key={p.rowNo} className="border-t border-slate-100">
                    <td className="p-1.5 text-slate-400">{p.rowNo}</td>
                    <td className="p-1.5"><span className={`px-1.5 py-0.5 rounded ${STATUS_LABEL[p.status][1]}`}>{STATUS_LABEL[p.status][0]}</span></td>
                    {fields.slice(0, 4).map((f) => <td key={f.key} className="p-1.5 truncate max-w-[10rem]">{f.number ? Number(p.data[f.key] || 0).toLocaleString('ko-KR') : p.data[f.key]}</td>)}
                    <td className="p-1.5 text-slate-500">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.length > 200 && <div className="p-2 text-xs text-slate-400">외 {plan.length - 200}줄 (저장은 전체 반영)</div>}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className={btn} onClick={() => setParsed(null)}>취소</button>
            <button disabled={busy || !(count('new') + count('update'))} onClick={save}
              className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50">
              {busy ? '저장 중...' : `저장 (추가 ${count('new')} · 보완 ${count('update')})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
