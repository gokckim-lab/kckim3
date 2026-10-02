import { useEffect, useRef, useState } from 'react';
import type { ProductRecord } from '../types';

interface Props {
  value: string;
  products: ProductRecord[];
  disabled?: boolean;
  onChange: (name: string) => void;
  onPick: (p: ProductRecord) => void;
}

const MAX_SHOWN = 8;

export default function ProductNameInput({ value, products, disabled, onChange, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const q = value.trim().toLowerCase();
  const matches = q
    ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.spec || '').toLowerCase().includes(q)).slice(0, MAX_SHOWN)
    : [];
  const show = open && matches.length > 0;

  // 품목표가 좁은 화면에서 가로 스크롤 영역 안에 들어가므로, 목록을 화면 기준(fixed)으로 띄워 잘리지 않게 한다.
  useEffect(() => {
    if (!show) return;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show]);

  const pick = (p: ProductRecord) => {
    onPick(p);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!show) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative">
      <input ref={inputRef} className="w-full border border-slate-200 rounded px-2 py-1" value={value} disabled={disabled}
        placeholder={products.length ? '품목명 (등록 품목 검색)' : undefined}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown} />
      {show && rect && (
        <ul style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 288) }}
          className="z-50 max-h-64 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
          {matches.map((p, i) => (
            <li key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 cursor-pointer flex justify-between gap-3 ${i === active ? 'bg-blue-50' : ''}`}>
              <span className="text-slate-800 truncate">{p.name}{p.spec && <span className="text-slate-400"> · {p.spec}</span>}</span>
              <span className="text-slate-500 shrink-0">{Number(p.unit_price || 0).toLocaleString('ko-KR')}원</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
