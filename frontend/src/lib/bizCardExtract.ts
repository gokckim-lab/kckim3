import type { PartyInfo } from '../types';
import { extractPdfText, ocrImage, ocrPdfFirstPage } from './pdfUtils';

const normalizeBizNo = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return raw;
};

// 국세청 홈택스 등 공문서는 라벨을 "사 업 자 등 록 번 호"처럼 한 글자씩 띄어 쓰는 경우가 많다.
// 글자+공백이 3번 이상 반복되는 구간(=자간 벌린 라벨/값)만 골라 내부 공백을 제거한다.
// (정상적인 여러 단어 문장은 글자 하나짜리 토큰이 이렇게 연속으로 나오지 않으므로 오탐 위험이 낮다)
export function collapseSpacedOutText(text: string): string {
  // 반복 2회 미만(즉, 공백을 사이에 둔 두 글자짜리 토큰 하나)은 정상 문장의 단어 경계와
  // 구분이 안 돼 오탐이 나므로 다루지 않는다 (업태/종목 같은 2글자 라벨은 아래에서 \s*로 별도 대응).
  return text.replace(/((?:[^\s\n][ \t]){2,}[^\s\n])/g, (run) => run.replace(/[ \t]+/g, ''));
}

// 텍스트를 줄 단위로 순회하며 라벨이 "줄의 시작 부분"에 오는 줄을 찾아 그 줄의 나머지를 값으로 캡처한다.
// (이전 버전은 STOP_LABELS를 이용한 lazy capture + lookahead 조합이었는데, 뒤따르는 줄에 정지 키워드가
//  하나도 없으면 정규식 전체가 매칭 실패(null)로 돌아가는 구조적 버그가 있었다. 줄 단위 탐색은 그런 실패가 없다.)
export function findLineValue(lines: string[], labelPattern: string): { value: string; index: number } | null {
  const re = new RegExp(`^\\s*(?:${labelPattern})\\s*[:：]?\\s*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) return { value: m[1].trim(), index: i };
  }
  return null;
}

// 값이 없고 라벨만 있는 줄(표 형식 레이아웃에서 값이 앞줄에 먼저 나오는 경우)이면 바로 이전 줄을 값으로 대신 쓴다.
export function findLabelValueWithPrevFallback(lines: string[], labelPattern: string): string {
  const found = findLineValue(lines, labelPattern);
  if (!found) return '';
  if (found.value) return found.value;
  for (let i = found.index - 1; i >= 0; i--) {
    const prev = lines[i].trim();
    if (prev) return prev;
  }
  return '';
}

/** 사업자등록증뿐 아니라 견적서/주문서 등의 "공급자/공급받는자" 정보 블록에도 재사용한다. */
export function parseBusinessCardText(rawText: string): Partial<PartyInfo> {
  if (!rawText || rawText.trim().length < 2) return {};
  try {
    const normalized = collapseSpacedOutText(rawText.replace(/\r/g, ''));
    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

    const bizNoMatch =
      normalized.match(/등록번호\s*[:：]?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{5})/) ||
      normalized.match(/(\d{3}-\d{2}-\d{5})/) ||
      normalized.match(/(?<!\d)(\d{10})(?!\d)/);
    const bizNo = bizNoMatch ? normalizeBizNo(bizNoMatch[1]) : '';

    let name = findLabelValueWithPrevFallback(lines, '상호\\s*(?:\\(법인명\\))?');
    if (!name) {
      const m = normalized.match(/\(주\)[^\n]{1,30}|주식회사[^\n]{1,20}|[^\n]{1,20}\s*(?:주식회사|㈜)/);
      if (m) name = m[0].trim();
    }
    // "버디 (법인명)" 처럼 라벨 잔재가 값 앞에 남는 경우를 대비해 선행 괄호 라벨을 한 번 더 제거
    name = name.replace(/^\(?법인명\)?\s*/, '').trim();

    let ceo = findLabelValueWithPrevFallback(lines, '성명\\s*(?:\\(대표자\\))?|대표자\\s*성명(?:\\([^)]*\\))?|대표자');
    ceo = ceo.replace(/^\([^)]*\)\s*/, '').split(/\s{2,}|\t/)[0].trim();

    let address = findLabelValueWithPrevFallback(lines, '사업장\\s*소재지|소재지|본점\\s*소재지');
    if (!address) {
      const m = normalized.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{5,60}/);
      if (m) address = m[0].trim();
    }

    let bizType = findLabelValueWithPrevFallback(lines, '업\\s*태');
    let bizItem = findLabelValueWithPrevFallback(lines, '종\\s*목');
    // "도매업 종목 사무용품"처럼 업태 값 뒤에 다음 라벨(종목)이 같은 줄에 붙어 나오면 거기서 잘라낸다
    bizType = bizType.split(/\s*종\s*목\s*/)[0].trim();

    const emailMatch = normalized.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    const email = emailMatch?.[1] ?? '';

    const telMatch = normalized.match(/(?:전화|TEL|Tel)\s*[:：]?\s*(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})/);
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
