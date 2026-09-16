import type { PartyInfo } from '../types';

// ---------------------------------------------------------------------------
// pdf.js / tesseract.js 는 CDN에서 지연 로딩한다 (번들 용량을 줄이기 위해).
// ---------------------------------------------------------------------------
async function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return w.pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (w.pdfjsLib) {
        w.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(w.pdfjsLib);
      } else reject(new Error('pdfjs 로드 실패'));
    };
    script.onerror = () => reject(new Error('pdfjs 스크립트 로드 실패 (네트워크 확인)'));
    document.head.appendChild(script);
  });
}

async function loadTesseract(): Promise<any> {
  const w = window as any;
  if (w.Tesseract) return w.Tesseract;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error('tesseract 로드 실패')));
    script.onerror = () => reject(new Error('tesseract 스크립트 로드 실패 (네트워크 확인)'));
    document.head.appendChild(script);
  });
}

/**
 * pdf.js의 getTextContent()는 텍스트 조각(item) 배열을 줄바꿈 정보 없이 반환한다.
 * 이전 버전 버그: 모든 item을 공백으로만 이어붙여서 라벨(상호/대표자/주소 등)을
 * 줄 단위로 구분하는 정규식이 전부 실패했다.
 * 여기서는 각 item의 y좌표(transform[5])로 같은 줄을 묶고, x좌표로 정렬한 뒤
 * 줄바꿈을 복원한다.
 */
function reconstructLines(items: any[]): string {
  const rows: { y: number; x: number; str: string }[] = items
    .filter((it) => (it.str || '').trim().length > 0)
    .map((it) => ({ y: it.transform[5], x: it.transform[4], str: it.str }));

  rows.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
  const Y_TOLERANCE = 3;
  for (const row of rows) {
    let line = lines.find((l) => Math.abs(l.y - row.y) <= Y_TOLERANCE);
    if (!line) {
      line = { y: row.y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: row.x, str: row.str });
  }

  return lines
    .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    const pages = Math.min(doc.numPages, 5);
    for (let i = 1; i <= pages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += reconstructLines(content.items) + '\n';
      } catch {
        /* skip broken page */
      }
    }
    return text;
  } catch (err) {
    console.warn('PDF 텍스트 추출 실패', err);
    return '';
  }
}

export async function ocrImage(file: File | Blob, onProgress?: (percent: number, status: string) => void): Promise<string> {
  try {
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(file, 'kor+eng', {
      logger: (l: any) => {
        if (l.status && typeof l.progress === 'number') onProgress?.(Math.round(l.progress * 100), l.status);
      },
    });
    return result?.data?.text || '';
  } catch (err) {
    console.warn('OCR 실패', err);
    return '';
  }
}

/** 스캔본(이미지) PDF: 1페이지를 캔버스에 렌더링한 뒤 OCR */
export async function ocrPdfFirstPage(file: File, onProgress?: (percent: number, status: string) => void): Promise<string> {
  try {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) return '';
    return ocrImage(blob, onProgress);
  } catch (err) {
    console.warn('PDF OCR 실패', err);
    return '';
  }
}

const normalizeBizNo = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return raw;
};

// 값 뒤에 다른 라벨이 바로 붙어있는 실제 사업자등록증 레이아웃을 감안해,
// 값 추출 시 "다음에 나올 수 있는 라벨들" 앞에서 잘라낸다.
const STOP_LABELS =
  '(?=상호|법인명|성명|대표자|생년월일|개업연월일|사업장|소재지|본점|사업의\\s*종류|업태|종목|공동사업자|교부사유|전화|e-?mail|이메일|$)';

function captureAfterLabel(text: string, labelPattern: string): string {
  // labelPattern이 "A|B" 형태의 교대(alternation)일 수 있으므로 반드시 그룹으로 감싸야
  // 뒤에 붙는 "값 캡처 + STOP_LABELS" 부분이 모든 대안에 공통 적용된다.
  const re = new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*([^\\n]+?)\\s*${STOP_LABELS}`, 'i');
  const m = text.match(re);
  return m?.[1]?.trim() ?? '';
}

export function parseBusinessCardText(rawText: string): Partial<PartyInfo> {
  if (!rawText || rawText.trim().length < 2) return {};
  try {
    const text = rawText.replace(/\r/g, '');

    const bizNoMatch =
      text.match(/등록\s*번호\s*[:：]?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/) ||
      text.match(/(\d{3}-\d{2}-\d{5})/) ||
      text.match(/(?<!\d)(\d{10})(?!\d)/);
    const bizNo = bizNoMatch ? normalizeBizNo(bizNoMatch[1]) : '';

    let name = captureAfterLabel(text, '상\\s*호\\s*(?:\\(\\s*법인명\\s*\\))?');
    if (!name) {
      const m = text.match(/\(주\)[^\n]{1,30}|주식회사[^\n]{1,20}|[^\n]{1,20}\s*(?:주식회사|㈜)/);
      if (m) name = m[0].trim();
    }

    const ceo = captureAfterLabel(text, '성\\s*명\\s*(?:\\(\\s*대표자\\s*\\))?|대표자\\s*(?:성명)?');

    let address = captureAfterLabel(text, '사업장\\s*소재지|소\\s*재\\s*지|본점\\s*소재지');
    if (!address) {
      const m = text.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{5,60}/);
      if (m) address = m[0].trim();
    }

    // "사업의 종류  업태  OOO   종목  OOO" 한 줄에 같이 있는 경우가 많다
    let bizType = captureAfterLabel(text, '업\\s*태');
    let bizItem = captureAfterLabel(text, '종\\s*목');

    const emailMatch = text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    const email = emailMatch?.[1] ?? '';

    const telMatch = text.match(/(?:전화|TEL|Tel)\s*[:：]?\s*(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/);
    const tel = telMatch ? telMatch[1].replace(/\s/g, '-') : '';

    return { bizNo, name, ceo, address, bizType, bizItem, email, tel };
  } catch (err) {
    console.warn('사업자등록증 파싱 실패', err);
    return {};
  }
}

export interface ExtractProgress {
  running: boolean;
  percent: number;
  status: string;
}

/** 사업자등록증 파일(PDF 또는 이미지)에서 텍스트를 뽑아 필드로 파싱한다 */
export async function extractBusinessCard(
  file: File,
  onProgress?: (p: ExtractProgress) => void
): Promise<Partial<PartyInfo>> {
  const report = (p: ExtractProgress) => onProgress?.(p);
  let text = '';

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    report({ running: true, percent: 10, status: '파일 분석 중...' });
    text = await extractPdfText(file);
    if (text.trim().length < 30) {
      report({ running: true, percent: 30, status: '스캔본 감지, OCR 준비 중...' });
      text = await ocrPdfFirstPage(file, (percent, status) =>
        report({ running: true, percent: 30 + Math.round(percent * 0.6), status })
      );
    }
  } else {
    report({ running: true, percent: 10, status: '이미지 OCR 진행 중...' });
    text = await ocrImage(file, (percent, status) => report({ running: true, percent, status }));
  }

  report({ running: false, percent: 100, status: '완료' });
  if (!text || text.trim().length < 5) return {};
  return parseBusinessCardText(text);
}
