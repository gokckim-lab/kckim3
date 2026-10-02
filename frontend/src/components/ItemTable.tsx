import type { DocumentItem, PartyInfo, ProductRecord } from '../types';
import { calcFromSupply, calcFromTotal, calcItemAmounts } from '../lib/documents';
import ProductNameInput from './ProductNameInput';

interface Props {
  items: DocumentItem[];
  onChange: (items: DocumentItem[]) => void;
  taxType: PartyInfo['taxType'];
  readOnly?: boolean;
  products?: ProductRecord[];
}

const won = (n: number) => n.toLocaleString('ko-KR');

export default function ItemTable({ items, onChange, taxType, readOnly, products = [] }: Props) {
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

  const updateTotal = (idx: number, total: number) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...calcFromTotal(total, it.qty, taxType) } : it)));
  const updateSupply = (idx: number, supply: number) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...calcFromSupply(supply, it.qty, taxType) } : it)));

  const roundingHint = (it: DocumentItem) =>
    it.qty > 0 && it.unit_price * it.qty !== it.supply_price
      ? `단가×수량(${won(it.unit_price * it.qty)})과 공급가액(${won(it.supply_price)})이 끝전 ${won(Math.abs(it.supply_price - it.unit_price * it.qty))}원 다릅니다. 세금계산서에는 공급가액·세액 기준으로 발행됩니다.`
      : undefined;

  const addRow = () => onChange([...items, { sort_order: items.length, name: '', spec: '', qty: 1, unit_price: 0, supply_price: 0, tax: 0, remark: '' }]);
  const removeRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* table-fixed: 입력칸의 기본 최소 너비 때문에 숫자 칸들이 커지고 품목칸만 좁아지는 것을 막고, 남는 폭을 품목칸에 몰아준다 */}
      {/* 휴대폰처럼 좁은 화면에서는 품목칸이 0이 되어 규격과 겹치므로, 최소 폭을 두고 표만 가로로 밀어 보게 한다 */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-sm table-fixed">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="p-2 text-left w-8 rounded-tl-xl">#</th>
            <th className="p-2 text-left">품목</th>
            <th className="p-2 text-left w-20">규격</th>
            <th className="p-2 text-right w-14">수량</th>
            <th className="p-2 text-right w-24">단가</th>
            <th className="p-2 text-right w-28">공급가액 ✎</th>
            <th className="p-2 text-right w-20">세액</th>
            <th className={`p-2 text-right w-28 ${readOnly ? 'rounded-tr-xl' : ''}`} title="합계를 입력하면 공급가액·세액이 거꾸로 계산됩니다">합계 ✎</th>
            {!readOnly && <th className="p-2 w-8 rounded-tr-xl" />}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="p-2 text-slate-400">{idx + 1}</td>
              <td className="p-1">
                <ProductNameInput value={it.name} products={products} disabled={readOnly}
                  onChange={(name) => update(idx, { name })}
                  onPick={(p) => update(idx, { name: p.name, spec: p.spec ?? '', unit_price: Number(p.unit_price) || 0 })} />
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
              <td className="p-1">
                <input type="number" className="w-full border border-slate-200 rounded px-2 py-1 text-right" value={it.supply_price}
                  disabled={readOnly} onChange={(e) => updateSupply(idx, Number(e.target.value))} title={roundingHint(it)} />
              </td>
              <td className="p-2 text-right text-slate-700">{won(it.tax)}</td>
              <td className="p-1">
                <input type="number" className="w-full border border-slate-200 rounded px-2 py-1 text-right" value={it.supply_price + it.tax}
                  disabled={readOnly} onChange={(e) => updateTotal(idx, Number(e.target.value))} title={roundingHint(it)} />
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
      </div>
      {!readOnly && (
        <button type="button" onClick={addRow} className="w-full text-sm text-blue-600 py-2 hover:bg-blue-50 print:hidden">
          + 품목 추가
        </button>
      )}
    </div>
  );
}
