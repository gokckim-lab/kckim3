// PDF.js / Tesseract.js 로딩과, PDF 텍스트를 줄/좌표 단위로 복원하는 공용 유틸.
// bizCardExtract.ts(사업자등록증)와 orderDocExtract.ts(견적서/주문서/거래명세서)가 같이 쓴다.

export interface TextLine {
  y: number;
  parts: { x: number; str: string }[];
}

export async function loadPdfJs(): Promise<any> {
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

export async function loadTesseract(): Promise<any> {
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
 * 각 item의 y좌표(transform[5])로 같은 줄을 묶고, x좌표로 정렬해 줄을 복원한다.
 * x좌표를 그대로 남겨두므로(표 형태 문서의) 열 위치 추정에도 쓸 수 있다.
 */
export function groupIntoLines(items: any[]): TextLine[] {
  const rows: { y: number; x: number; str: string }[] = items
    .filter((it) => (it.str || '').trim().length > 0)
    .map((it) => ({ y: it.transform[5], x: it.transform[4], str: it.str }));

  rows.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  const Y_TOLERANCE = 3;
  for (const row of rows) {
    let line = lines.find((l) => Math.abs(l.y - row.y) <= Y_TOLERANCE);
    if (!line) {
      line = { y: row.y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: row.x, str: row.str });
  }
  for (const line of lines) line.parts.sort((a, b) => a.x - b.x);
  return lines;
}

export function lineToText(line: TextLine): string {
  return line.parts.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * 일부 PDF 템플릿(견적서 양식 등)은 표 헤더 글자를 "품 목 명"처럼 한 글자씩
 * 따로따로 배치해서 만든다. 이 경우 각 part.str가 한 글자뿐이라 "품목" 같은
 * 온전한 단어 매칭이 안 되므로, 줄 전체를 글자 단위로 펼쳐서(공백 제외) 검색할 수
 * 있게 해준다. 각 글자는 자신이 속했던 part의 x좌표를 그대로 물려받는다.
 */
export function flattenLineChars(line: TextLine): { ch: string; x: number }[] {
  const chars: { ch: string; x: number }[] = [];
  for (const part of line.parts) {
    for (const ch of part.str) {
      if (ch.trim()) chars.push({ ch, x: part.x });
    }
  }
  return chars;
}

export function linesToText(lines: TextLine[]): string {
  return lines.map(lineToText).filter(Boolean).join('\n');
}

/** PDF의 각 페이지를 줄 단위(TextLine[])로 반환한다. 텍스트 레이어가 없으면 빈 배열. */
export async function extractPdfLines(file: File, maxPages = 5): Promise<TextLine[]> {
  try {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const allLines: TextLine[] = [];
    const pages = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= pages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        allLines.push(...groupIntoLines(content.items));
      } catch {
        /* skip broken page */
      }
    }
    return allLines;
  } catch (err) {
    console.warn('PDF 텍스트 추출 실패', err);
    return [];
  }
}

export async function extractPdfText(file: File): Promise<string> {
  const lines = await extractPdfLines(file);
  return linesToText(lines);
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
