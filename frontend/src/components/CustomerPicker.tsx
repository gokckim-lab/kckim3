import { useState } from 'react';
import type { CustomerRecord } from '../types';
import { matchesCustomer } from '../lib/customers';

interface Props {
  customers: CustomerRecord[];
  selectedId: string | null;
  onPick: (id: string) => void;
  disabled?: boolean;
}

const MAX_SHOWN = 30;

export default function CustomerPicker({ customers, selectedId, onPick, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = customers.find((c) => c.id === selectedId);
  const matches = customers.filter((c) => matchesCustomer(c, query));
  const shown = matches.slice(0, MAX_SHOWN);

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active].id); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative">
      <input
        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
        placeholder={customers.length ? '상호·사업자번호·대표자로 검색 (비우면 직접 입력)' : '등록된 거래처가 없습니다 (직접 입력)'}
        value={open ? query : selected?.name ?? ''}
        disabled={disabled || customers.length === 0}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
          {selectedId && (
            <li onMouseDown={(e) => { e.preventDefault(); pick(''); }}
              className="px-3 py-2 text-slate-500 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
              -- 선택 해제 (직접 입력) --
            </li>
          )}
          {shown.length === 0 && <li className="px-3 py-2 text-slate-400">일치하는 거래처가 없습니다.</li>}
          {shown.map((c, i) => (
            <li key={c.id}
              onMouseDown={(e) => { e.preventDefault(); pick(c.id); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${i === active ? 'bg-blue-50' : ''} ${c.id === selectedId ? 'font-semibold' : ''}`}>
              <div className="text-slate-800">{c.name}</div>
              <div className="text-xs text-slate-400">{[c.biz_no, c.ceo].filter(Boolean).join(' · ')}</div>
            </li>
          ))}
          {matches.length > MAX_SHOWN && (
            <li className="px-3 py-2 text-xs text-slate-400">외 {matches.length - MAX_SHOWN}곳 — 검색어를 더 입력하세요.</li>
          )}
        </ul>
      )}
    </div>
  );
}
