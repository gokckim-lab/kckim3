import type { DocumentItem, PartyInfo } from '../types';
import { extractPdfLines, extractPdfText, ocrImage, ocrPdfFirstPage, linesToText, flattenLineChars, type TextLine } from './pdfUtils';
import { parseBusinessCardText } from './bizCardExtract';

export interface ExtractProgress {
  running: boolean;
  percent: number;
  status: string;
}

export interface OrderDocResult {
  supplier: Partial<PartyInfo>;
  customer: Partial<PartyInfo>;
  items: DocumentItem[];
  memo: string;
}

// 회사마다 열 이름이 제각각이라, 흔히 쓰이는 표현을 폭넓게 인식한다.
// 글자 사이가 띄어져 있을 수 있어 각 글자 사이에 \s*를 둔다.
const s = (word: string) => word.split('').join('\\s*');
// 줄 전체를 이어붙인 문자열(flattenLineChars 결과) 안에서 부분 문자열로 찾으므로
// 앞뒤를 ^...$로 고정하지 않는다. 일부 견적서 양식은 "품 목 명"처럼 헤더 글자를
// 한 글자씩 따로 찍어두는데, part 단위로 온전한 단어 매칭을 하면 이런 문서에서
// 표 헤더를 전혀 인식하지 못해 품목 전체가 빠지는 문제가 있었다.
const COLUMN_PATTERNS: { key: keyof RowCells; re: RegExp }[] = [
  { key: 'name', re: new RegExp(`(?:${s('품목')}|${s('품명')}|${s('제품명')}|${s('상품명')}|${s('내역')}|${s('명칭')}|item|product)`, 'i') },
  { key: 'spec', re: new RegExp(`(?:${s('규격')}|${s('사양')}|${s('규격사양')}|spec)`, 'i') },
  { key: 'qty', re: new RegExp(`(?:${s('수량')}|${s('개수')}|qty)`, 'i') },
  { key: 'unitPrice', re: new RegExp(`(?:${s('단가')}|${s('가격')}|price)`, 'i') },
  { key: 'supplyPrice', re: new RegExp(`(?:${s('공급가액')}|${s('공급가')}|${s('금액')}|${s('합계금액')}|amount)`, 'i') },
  { key: 'tax', re: new RegExp(`(?:${s('세액')}|${s('부가세')}|vat)`, 'i') },
  { key: 'remark', re: new RegExp(`(?:${s('비고')}|note|remark)`, 'i') },
];

interface RowCells {
  name: string;
  spec: string;
  qty: string;
  unitPrice: string;
  supplyPrice: string;
  tax: string;
  remark: string;
}

// "합계"뿐 아니라 총합 줄을 그냥 "계"로만 표기하는 양식도 있고, 표 아래에는 보통
// "입금계좌번호:", "비고:" 같은 안내 문구가 이어진다. 이런 줄까지 품목으로 잘못
// 집계되지 않도록 표가 끝나는 신호로 함께 인식한다.
const STOP_ROW = /^(합\s*계|소\s*계|총\s*계|총\s*액|총\s*합\s*계|계|total|이\s*하\s*여\s*백|입\s*금\s*계\s*좌|비\s*고\s*[:：]?$)/i;

function findHeader(lines: TextLine[]): { index: number; columns: { key: keyof RowCells; x: number }[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const chars = flattenLineChars(lines[i]);
    if (chars.length === 0) continue;
    const flat = chars.map((c) => c.ch).join('');
    const columns: { key: keyof RowCells; x: number }[] = [];
    for (const patt of COLUMN_PATTERNS) {
      const match = flat.match(patt.re);
      if (match && match.index != null && !columns.some((c) => c.key === patt.key)) {
        columns.push({ key: patt.key, x: chars[match.index].x });
      }
    }
    // 품목/품명 칸 + 나머지 중 최소 1개(수량/단가/금액) 이상 잡히면 표의 헤더 줄로 본다.
    const hasName = columns.some((c) => c.key === 'name');
    const hasNumericCol = columns.some((c) => ['qty', 'unitPrice', 'supplyPrice'].includes(c.key));
    if (hasName && hasNumericCol && columns.length >= 2) {
      return { index: i, columns: columns.sort((a, b) => a.x - b.x) };
    }
  }
  return null;
}

function assignToColumn(x: number, columns: { key: keyof RowCells; x: number }[]): keyof RowCells {
  let best = columns[0];
  for (const col of columns) {
    if (x >= col.x - 5) best = col;
    else break;
  }
  return best.key;
}

const toNumber = (raw: string): number => {
  const n = Number(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function parseRows(lines: TextLine[], headerIndex: number, columns: { key: keyof RowCells; x: number }[]): DocumentItem[] {
  const items: DocumentItem[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.parts.map((p) => p.str).join(' ').trim();
    if (!lineText) continue;
    if (STOP_ROW.test(lineText.replace(/\s+/g, ''))) break;

    const cells: RowCells = { name: '', spec: '', qty: '', unitPrice: '', supplyPrice: '', tax: '', remark: '' };
    for (const part of line.parts) {
      const key = assignToColumn(part.x, columns);
      cells[key] = (cells[key] ? cells[key] + ' ' : '') + part.str;
    }
    // 양식에 미리 인쇄된 빈 줄은 값 대신 "-"만 찍혀 있는 경우가 많다. 이런 자리표시자는
    // 빈 값과 동일하게 취급해야, 아래에서 수량 기본값(1)이 붙어 빈 줄이 가짜 품목으로 남지 않는다.
    for (const key of Object.keys(cells) as (keyof RowCells)[]) {
      const trimmed = cells[key].trim();
      cells[key] = /^-+$/.test(trimmed) ? '' : trimmed;
    }

    if (!cells.name && !cells.qty && !cells.unitPrice && !cells.supplyPrice) continue;

    const qty = cells.qty ? toNumber(cells.qty) : 1;
    const unitPrice = toNumber(cells.unitPrice);
    const supplyPrice = cells.supplyPrice ? toNumber(cells.supplyPrice) : Math.round(qty * unitPrice);
    const tax = cells.tax ? toNumber(cells.tax) : 0;

    // 이름/수량/단가/금액이 전부 비어있으면 표와 무관한 잡음 줄일 가능성이 높으니 건너뛴다.
    if (!cells.name && qty === 0 && unitPrice === 0 && supplyPrice === 0) continue;

    items.push({
      sort_order: items.length,
      name: cells.name,
      spec: cells.spec,
      qty: qty || 1,
      unit_price: unitPrice,
      supply_price: supplyPrice,
      tax,
      remark: cells.remark,
    });

    if (items.length >= 200) break; // 안전장치
  }
  return items;
}

const CUSTOMER_MARKERS = ['공급받는자', '공급받는 자', '주문자', '발주처', '수요처', '납품처', '구매자', '거래처'];
const SUPPLIER_MARKERS = ['공급자', '발행처', '공급하는자', '공급하는 자'];

function findFirstMarkerIndex(text: string, markers: string[]): number {
  let best = -1;
  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx >= 0 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function extractParties(flatText: string, headerLineText: string): { supplier: Partial<PartyInfo>; customer: Partial<PartyInfo> } {
  const custIdx = findFirstMarkerIndex(flatText, CUSTOMER_MARKERS);
  const supIdx = findFirstMarkerIndex(flatText, SUPPLIER_MARKERS);

  let supplierText = '';
  let customerText = '';

  if (custIdx >= 0) {
    // 품목표 헤더가 나오기 시작하면 그 뒤는 거래처 정보가 아니라 표 내용이므로 잘라낸다.
    const tableStart = headerLineText ? flatText.indexOf(headerLineText, custIdx) : -1;
    customerText = tableStart >= 0 ? flatText.slice(custIdx, tableStart) : flatText.slice(custIdx, custIdx + 600);
    supplierText = supIdx >= 0 && supIdx < custIdx ? flatText.slice(supIdx, custIdx) : flatText.slice(0, custIdx);
  } else {
    // 공급받는자 표시를 못 찾으면 문서 전체에서 한 벌만 뽑아 customer 쪽에 채운다(보수적 기본값).
    const tableStart = headerLineText ? flatText.indexOf(headerLineText) : -1;
    customerText = tableStart >= 0 ? flatText.slice(0, tableStart) : flatText;
  }

  return {
    supplier: supplierText ? parsePartyWithFallbackName(supplierText, SUPPLIER_MARKERS) : {},
    customer: parsePartyWithFallbackName(customerText, CUSTOMER_MARKERS),
  };
}

// "주문자(발주처) 테스트상사"처럼, 구획을 나누는 데 쓴 마커 라벨 줄 자체가 회사명 값을 담고 있는
// 문서가 많다. 사업자등록증 라벨(상호/법인명)만 아는 기존 파서가 이름을 못 찾으면 이걸로 보완한다.
function parsePartyWithFallbackName(text: string, markers: string[]): Partial<PartyInfo> {
  const result = parseBusinessCardText(text);
  if (result.name) return result;

  const markerPattern = markers.map((m) => m.replace(/\s+/g, '\\s*')).join('|');
  const re = new RegExp(`^\\s*(?:${markerPattern})\\s*(?:\\([^)]*\\))?\\s*[:：]?\\s*(.+)$`, 'im');
  const m = text.match(re);
  if (m && m[1].trim()) return { ...result, name: m[1].trim() };
  return result;
}

async function getText(file: File, onProgress?: (p: ExtractProgress) => void): Promise<{ text: string; lines: TextLine[] }> {
  const report = (p: ExtractProgress) => onProgress?.(p);
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    report({ running: true, percent: 10, status: '파일 분석 중...' });
    const lines = await extractPdfLines(file);
    const text = linesToText(lines);
    if (text.trim().length >= 30) return { text, lines };

    report({ running: true, percent: 30, status: '스캔본 감지, OCR 준비 중...' });
    const ocrText = await ocrPdfFirstPage(file, (percent, status) =>
      report({ running: true, percent: 30 + Math.round(percent * 0.6), status })
    );
    // 스캔본은 좌표 정보가 없어 표 열 인식이 어렵다. 줄바꿈 기준으로만 최대한 파싱한다.
    const pseudoLines: TextLine[] = ocrText.split('\n').map((l, idx) => ({ y: -idx, parts: [{ x: 0, str: l }] }));
    return { text: ocrText, lines: pseudoLines };
  }

  report({ running: true, percent: 10, status: '이미지 OCR 진행 중...' });
  const ocrText = await ocrImage(file, (percent, status) => report({ running: true, percent, status }));
  const pseudoLines: TextLine[] = ocrText.split('\n').map((l, idx) => ({ y: -idx, parts: [{ x: 0, str: l }] }));
  return { text: ocrText, lines: pseudoLines };
}

/** 견적서/주문서/거래명세서 등 PDF(또는 이미지)에서 거래처 정보 + 품목표를 함께 추출한다. */
export async function extractOrderDocument(
  file: File,
  onProgress?: (p: ExtractProgress) => void
): Promise<OrderDocResult> {
  const { text, lines } = await getText(file, onProgress);
  onProgress?.({ running: false, percent: 100, status: '완료' });
  if (!text || text.trim().length < 5) return { supplier: {}, customer: {}, items: [], memo: '' };

  const header = findHeader(lines);
  const items = header ? parseRows(lines, header.index, header.columns) : [];
  const headerLineText = header ? lines[header.index].parts.map((p) => p.str).join(' ').trim() : '';
  const { supplier, customer } = extractParties(text, headerLineText);

  return { supplier, customer, items, memo: '' };
}

// 하위 호환용 재노출 (기존 코드에서 extractPdfText를 이 모듈 경로로 import하던 경우 대비)
export { extractPdfText };
