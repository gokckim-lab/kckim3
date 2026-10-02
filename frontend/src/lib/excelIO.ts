import { loadXlsx, readWorkbook } from './officeDocUtils';

export type ExcelKind = 'customers' | 'products';

interface FieldSpec {
  key: string;
  label: string; // 양식/내보내기 머리글
  aliases: string[]; // 다른 프로그램에서 뽑은 엑셀의 머리글도 알아보기 위한 이름들
  required?: boolean;
  number?: boolean;
}

export const SPECS: Record<ExcelKind, { title: string; fields: FieldSpec[] }> = {
  customers: {
    title: '거래처',
    fields: [
      { key: 'name', label: '상호', aliases: ['상호', '거래처명', '거래처', '업체명', '회사명', '상호법인명', '법인명', '공급받는자'], required: true },
      { key: 'biz_no', label: '사업자등록번호', aliases: ['사업자등록번호', '사업자번호', '등록번호'] },
      { key: 'ceo', label: '대표자', aliases: ['대표자', '대표자명', '대표', '성명'] },
      { key: 'address', label: '주소', aliases: ['주소', '사업장주소', '사업장소재지', '소재지'] },
      { key: 'biz_type', label: '업태', aliases: ['업태'] },
      { key: 'biz_item', label: '종목', aliases: ['종목'] },
      { key: 'contact', label: '담당자', aliases: ['담당자', '담당자명'] },
      { key: 'tel', label: '전화번호', aliases: ['전화번호', '전화', '연락처', '휴대폰', 'tel'] },
      { key: 'email', label: '이메일', aliases: ['이메일', '메일', 'email', 'e-mail', '전자우편'] },
      { key: 'memo', label: '메모', aliases: ['메모', '비고'] },
    ],
  },
  products: {
    title: '품목',
    fields: [
      { key: 'name', label: '품목명', aliases: ['품목명', '품목', '품명', '상품명', '제품명'], required: true },
      { key: 'spec', label: '규격', aliases: ['규격', '사양', '옵션'] },
      { key: 'unit', label: '단위', aliases: ['단위'] },
      { key: 'unit_price', label: '단가', aliases: ['단가', '판매가', '판매단가', '가격', '공급단가'], number: true },
      { key: 'memo', label: '메모', aliases: ['메모', '비고'] },
    ],
  },
};

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[\s()·._\-/]/g, '');
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// 같은 거래처/품목인지 판단하는 기준: 거래처는 사업자번호(없으면 상호), 품목은 품목명+규격.
export function dedupeKey(kind: ExcelKind, r: Record<string, any>): string {
  if (kind === 'customers') {
    const b = digits(r.biz_no);
    return b.length === 10 ? `B:${b}` : `N:${String(r.name ?? '').trim()}`;
  }
  return `${norm(r.name)}|${norm(r.spec)}`;
}

export interface ParsedRow { rowNo: number; data: Record<string, any>; error?: string }

export async function parseExcel(kind: ExcelKind, file: File): Promise<{ rows: ParsedRow[]; missingRequired: boolean }> {
  const { XLSX, wb } = await readWorkbook(file);
  const sheet: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const fields = SPECS[kind].fields;

  // 머리글 줄은 맨 위가 아닐 수 있어(제목 줄 등) 앞쪽 10줄 중 머리글이 가장 많이 맞는 줄을 고른다.
  let headerIdx = -1;
  let colMap: Record<number, FieldSpec> = {};
  for (let i = 0; i < Math.min(10, sheet.length); i++) {
    const map: Record<number, FieldSpec> = {};
    sheet[i].forEach((cell, col) => {
      const f = fields.find((fs) => fs.aliases.some((a) => norm(a) === norm(cell)));
      if (f && !Object.values(map).includes(f)) map[col] = f;
    });
    if (Object.keys(map).length > Object.keys(colMap).length) { colMap = map; headerIdx = i; }
  }
  const missingRequired = !fields.filter((f) => f.required).every((f) => Object.values(colMap).includes(f));
  if (headerIdx < 0 || missingRequired) return { rows: [], missingRequired: true };

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < sheet.length; i++) {
    const data: Record<string, any> = {};
    for (const [col, f] of Object.entries(colMap)) {
      const raw = String(sheet[i][Number(col)] ?? '').trim();
      data[f.key] = f.number ? Number(raw.replace(/[^\d.-]/g, '')) || 0 : raw;
    }
    if (Object.values(data).every((v) => v === '' || v === 0)) continue;
    const missing = fields.filter((f) => f.required && !String(data[f.key] ?? '').trim()).map((f) => f.label);
    rows.push({ rowNo: i + 1, data, error: missing.length ? `${missing.join(', ')} 없음` : undefined });
  }
  return { rows, missingRequired: false };
}

export async function downloadExcel(kind: ExcelKind, filename: string, records: Record<string, any>[]) {
  const XLSX = await loadXlsx();
  const fields = SPECS[kind].fields;
  const aoa = [fields.map((f) => f.label), ...records.map((r) => fields.map((f) => r[f.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = fields.map((f) => ({ wch: ['address', 'name', 'email', 'memo'].includes(f.key) ? 28 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SPECS[kind].title);
  XLSX.writeFile(wb, filename);
}
