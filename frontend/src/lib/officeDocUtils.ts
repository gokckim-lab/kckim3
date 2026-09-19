// 엑셀/워드/한글(hwpx) 파일을 PDF와 같은 TextLine[] 형태(줄 + x좌표)로 바꿔주는 유틸.
// 표의 "몇 번째 열인지"를 x좌표(열 번호 × 100)로 삼아, PDF용 표 인식 로직을 그대로 재사용한다.

import type { TextLine } from './pdfUtils';

const COL_WIDTH = 100;

function loadScript(src: string, globalName: string): Promise<any> {
  const w = window as any;
  if (w[globalName]) return Promise.resolve(w[globalName]);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (w[globalName] ? resolve(w[globalName]) : reject(new Error(`${globalName} 로드 실패`)));
    script.onerror = () => reject(new Error(`${globalName} 스크립트 로드 실패 (네트워크 확인)`));
    document.head.appendChild(script);
  });
}

const loadXlsx = () => loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'XLSX');
const loadJsZip = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');

type Cell = { col: number; text: string };

function rowsToLines(rows: Cell[][]): TextLine[] {
  const lines: TextLine[] = [];
  for (const cells of rows) {
    const parts = cells
      .filter((c) => c.text.trim())
      .map((c) => ({ x: c.col * COL_WIDTH, str: c.text.trim() }));
    if (parts.length) lines.push({ y: -lines.length, parts });
  }
  return lines;
}

export type OfficeKind = 'excel' | 'word' | 'hwpx';

export function detectOfficeKind(file: File): OfficeKind | null {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|csv)$/.test(name)) return 'excel';
  if (name.endsWith('.docx')) return 'word';
  if (name.endsWith('.hwpx')) return 'hwpx';
  return null;
}

export function unsupportedOfficeMessage(file: File): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwp')) return '구형 한글(.hwp) 파일은 지원하지 않습니다. 한글에서 PDF 또는 .hwpx로 저장한 뒤 올려주세요.';
  if (name.endsWith('.doc')) return '구형 워드(.doc) 파일은 지원하지 않습니다. 워드에서 .docx 또는 PDF로 저장한 뒤 올려주세요.';
  return null;
}

async function excelLines(file: File): Promise<TextLine[]> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  let wb;
  if (file.name.toLowerCase().endsWith('.csv')) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('euc-kr').decode(buf);
    }
    wb = XLSX.read(text, { type: 'string' });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  const rows: Cell[][] = [];
  for (const sheetName of wb.SheetNames.slice(0, 3)) {
    const data: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    for (const row of data) rows.push(row.map((v, col) => ({ col, text: String(v ?? '') })));
  }
  return rowsToLines(rows);
}

const byLocal = (el: Element | Document, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));
const childrenByLocal = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => c.localName === name);

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function docxParagraphText(p: Element): string {
  return byLocal(p, 't').map((t) => t.textContent ?? '').join('');
}

async function docxLines(file: File): Promise<TextLine[]> {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('워드 파일 내용을 읽을 수 없습니다.');
  const body = byLocal(parseXml(xml), 'body')[0];
  if (!body) return [];

  const rows: Cell[][] = [];
  for (const node of Array.from(body.children)) {
    if (node.localName === 'p') {
      rows.push([{ col: 0, text: docxParagraphText(node) }]);
    } else if (node.localName === 'tbl') {
      for (const tr of childrenByLocal(node, 'tr')) {
        let col = 0;
        const cells: Cell[] = [];
        for (const tc of childrenByLocal(tr, 'tc')) {
          const span = Number(byLocal(tc, 'gridSpan')[0]?.getAttribute('w:val') ?? byLocal(tc, 'gridSpan')[0]?.getAttribute('val') ?? 1) || 1;
          const text = childrenByLocal(tc, 'p').map(docxParagraphText).join(' ');
          cells.push({ col, text });
          col += span;
        }
        rows.push(cells);
      }
    }
  }
  return rowsToLines(rows);
}

async function hwpxLines(file: File): Promise<TextLine[]> {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sectionNames: string[] = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (sectionNames.length === 0) throw new Error('한글(.hwpx) 파일 내용을 읽을 수 없습니다.');

  const rows: Cell[][] = [];
  for (const name of sectionNames) {
    const doc = parseXml(await zip.file(name)!.async('string'));
    const sec = doc.documentElement;
    for (const p of childrenByLocal(sec, 'p')) {
      const tables = byLocal(p, 'tbl');
      if (tables.length === 0) {
        rows.push([{ col: 0, text: byLocal(p, 't').map((t) => t.textContent ?? '').join('') }]);
        continue;
      }
      for (const tbl of tables) {
        for (const tr of childrenByLocal(tbl, 'tr')) {
          const cells: Cell[] = childrenByLocal(tr, 'tc').map((tc, idx) => {
            const addr = byLocal(tc, 'cellAddr')[0];
            const col = addr ? Number(addr.getAttribute('colAddr') ?? idx) : idx;
            const text = byLocal(tc, 'p').map((cp) => byLocal(cp, 't').map((t) => t.textContent ?? '').join('')).join(' ');
            return { col, text };
          });
          rows.push(cells);
        }
      }
    }
  }
  return rowsToLines(rows);
}

export async function extractOfficeLines(file: File, kind: OfficeKind): Promise<TextLine[]> {
  if (kind === 'excel') return excelLines(file);
  if (kind === 'word') return docxLines(file);
  return hwpxLines(file);
}
