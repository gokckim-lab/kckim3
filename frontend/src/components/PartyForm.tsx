import type { PartyInfo } from '../types';
import BizCardUpload from './BizCardUpload';

interface Props {
  title: string;
  value: PartyInfo;
  onChange: (next: PartyInfo) => void;
  showTaxOptions?: boolean;
}

const FIELD: { key: keyof PartyInfo; label: string; placeholder?: string }[] = [
  { key: 'bizNo', label: '사업자등록번호', placeholder: '123-45-67890' },
  { key: 'name', label: '상호(법인명)' },
  { key: 'ceo', label: '대표자' },
  { key: 'address', label: '사업장 소재지' },
  { key: 'bizType', label: '업태' },
  { key: 'bizItem', label: '종목' },
  { key: 'contact', label: '담당자' },
  { key: 'tel', label: '전화번호' },
  { key: 'email', label: '이메일' },
];

export default function PartyForm({ title, value, onChange, showTaxOptions }: Props) {
  const set = (key: keyof PartyInfo, v: string) => onChange({ ...value, [key]: v });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <BizCardUpload label={title} onExtracted={(fields) => onChange({ ...value, ...fields })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELD.map((f) => (
          <label key={f.key} className="text-xs text-slate-500 flex flex-col gap-1">
            {f.label}
            <input
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800"
              value={value[f.key] as string}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        ))}
        {showTaxOptions && (
          <>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              과세 유형
              <select
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800"
                value={value.taxType}
                onChange={(e) => set('taxType', e.target.value)}
              >
                <option value="과세">과세</option>
                <option value="면세">면세</option>
                <option value="영세">영세</option>
              </select>
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              영수/청구
              <select
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800"
                value={value.purposeType}
                onChange={(e) => set('purposeType', e.target.value)}
              >
                <option value="영수">영수</option>
                <option value="청구">청구</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
