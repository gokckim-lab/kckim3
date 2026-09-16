import type { DocumentItem, PartyInfo } from '../types';
import { calcItemAmounts } from '../lib/documents';

interface Props {
  items: DocumentItem[];
  onChange: (items: DocumentItem[]) => void;
  taxType: PartyInfo['taxType'];
  readOnly?: boolean;
}

const won = (n: number) => n.toLocaleString('ko-KR');

export default function ItemTable({ items, onChange, taxType, readOnly }: Props) {
  const update = (idx: number, patch: Partial<DocumentItem>) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      if ('qty' in patch || 'unit_price' in patch) {
        Object.assign(merged, calcItemAmounts(merged, taxType));
      }
      return merged;
    });
    onChange(next);
  };

  const addRow = () => onChange([...items, { sort_order: items.length, name: '', spec: '', qty: 1, unit_price: 0, supply_price: 0, tax: 0, remark: '' }]);
  const removeRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="p-2 text-left w-8">#</th>
            <th className="p-2 text-left">품목</th>
            <th className="p-2 text-left w-28">규격</th>
            <th className="p-2 text-right w-16">수량</th>
            <th className="p-2 text-right w-24">단가</th>
            <th className="p-2 text-right w-24">공급가액</th>
            <th className="p-2 text-right w-20">세액</th>
            <th className="p-2 text-left w-28">비고</th>
            {!readOnly && <th className="p-2 w-8" />}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="p-2 text-slate-400">{idx + 1}</td>
              <td className="p-1">
                <input className="w-full border border-slate-200 rounded px-2 py-1" value={it.name}
                  disabled={readOnly} onChange={(e) => update(idx, { name: e.target.value })} />
              </td>
              <td className="p-1">
                <input className="w-full border border-slate-200 rounded px-2 py-1" value={it.spec}
                  disabled={readOnly} onChange={(e) => update(idx, { spec: e.target.value })} />
              </td>
              <td className="p-1">
                <input type="number" className="w-full border border-slate-200 rounded px-2 py-1 text-right" value={it.qty}
                  disabled={readOnly} onChange={(e) => update(idx, { qty: Number(e.target.value) })} />
              </td>
              <td className="p-1">
                <input type="number" className="w-full border border-slate-200 rounded px-2 py-1 text-right" value={it.unit_price}
                  disabled={readOnly} onChange={(e) => update(idx, { unit_price: Number(e.target.value) })} />
              </td>
              <td className="p-2 text-right text-slate-700">{won(it.supply_price)}</td>
              <td className="p-2 text-right text-slate-700">{won(it.tax)}</td>
              <td className="p-1">
                <input className="w-full border border-slate-200 rounded px-2 py-1" value={it.remark}
                  disabled={readOnly} onChange={(e) => update(idx, { remark: e.target.value })} />
              </td>
              {!readOnly && (
                <td className="p-2 text-center">
                  <button type="button" onClick={() => removeRow(idx)} className="text-slate-400 hover:text-rose-500">✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button type="button" onClick={addRow} className="w-full text-sm text-blue-600 py-2 hover:bg-blue-50 print:hidden">
          + 품목 추가
        </button>
      )}
    </div>
  );
}
