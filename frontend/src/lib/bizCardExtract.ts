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

    // 라벨 글자 사이 간격은 collapseSpacedOutText가 못 지우는 경우가 있다(공백이 한 칸이
    // 아니라 여러 칸이면 "글자+공백 1칸" 반복 패턴에 안 걸려서 그대로 남는다 — 큰 제목 라벨
    // ("상   호", "성   명")일수록 이런 넓은 간격이 잘 생긴다). 그래서 값을 미리 뭉쳐 놓는 데
    // 기대지 않고, 라벨 자체를 글자 사이 \s*를 넣어 널널하게 매칭한다.
    // 개인사업자 증명서는 "상호(법인명)", 법인사업자 증명서는 "법인명(단체명)"을 쓴다 — 서식이
    // 다르면 라벨 자체가 다르므로 둘 다 받아 준다.
    let name = findLabelValueWithPrevFallback(
      lines,
      '상\\s*호\\s*(?:\\(\\s*법\\s*인\\s*명\\s*\\))?|법\\s*인\\s*명\\s*(?:\\(\\s*단\\s*체\\s*명\\s*\\))?'
    );
    if (!name) {
      const m = normalized.match(/\(주\)[^\n]{1,30}|주식회사[^\n]{1,20}|[^\n]{1,20}\s*(?:\(주\)|주식회사|㈜)/);
      if (m) name = m[0].trim();
    }
    // "버디 (법인명)" 처럼 라벨 잔재가 값 앞에 남는 경우를 대비해 선행 괄호 라벨을 한 번 더 제거
    name = name.replace(/^\(?(?:법인명|단체명)\)?\s*/, '').trim();

    let ceo = findLabelValueWithPrevFallback(
      lines,
      '성\\s*명\\s*(?:\\(\\s*대\\s*표\\s*자\\s*\\))?|대\\s*표\\s*자\\s*성\\s*명(?:\\([^)]*\\))?|대\\s*표\\s*자'
    );
    // 값 뒤에 같은 줄로 다음 항목(생년월일 등)이 넓은 공백을 사이에 두고 이어 붙는 경우가
    // 많아서, 공백 2칸 이상을 열 경계로 보고 그 앞부분만 잘라 쓴다.
    ceo = ceo.replace(/^\([^)]*\)\s*/, '').split(/\s{2,}|\t/)[0].trim();

    let address = findLabelValueWithPrevFallback(
      lines,
      '사\\s*업\\s*장\\s*소\\s*재\\s*지|소\\s*재\\s*지|본\\s*점\\s*소\\s*재\\s*지'
    );
    if (!address) {
      const m = normalized.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{5,60}/);
      if (m) address = m[0].trim();
    }

    let bizType = findLabelValueWithPrevFallback(lines, '업\\s*태');
    let bizItem = findLabelValueWithPrevFallback(lines, '종\\s*목');
    // "도매업 종목 사무용품"처럼 업태 값 뒤에 다음 라벨(종목)이 같은 줄에 붙어 나오면 거기서 잘라낸다
    bizType = bizType.split(/\s*종\s*목\s*/)[0].trim();

    // 사업자등록증의 "사업의 종류" 표는 "업태"/"종목" 라벨이 줄 맨 앞이 아니라 "사업의 종류 [업태] 값1  [종목] 값2"처럼
    // 같은 줄 중간에 체크박스 글자로 박혀 있어서, 줄 시작만 보는 findLineValue로는 애초에 못 찾는다.
    // 게다가 그 체크박스([업태]/[종목])는 OCR이 자주 깨뜨린다(예: "[FH", "[총록|" 같은 글자 쓰레기로 변함).
    // 그 쓰레기가 정확히 어떤 모양일지 예측할 수 없어 패턴으로 걸러내는 대신, 값 사이의 넓은 공백(2칸 이상)을
    // 열 경계로 삼아 먼저 업태 칸/종목 칸으로 나눈 뒤, 각 칸에서 맨 앞 토큰(라벨/깨진 체크박스)만 잘라내고
    // 나머지를 값으로 쓴다 — "사업의종류[FH 도매및소매업" → 앞 토큰 버림 → "도매및소매업".
    if (!bizType || !bizItem) {
      const bizRow = lines.find((l) => /사\s*업\s*의\s*종\s*류/.test(l));
      if (bizRow) {
        const cols = bizRow
          .split(/\s{2,}/)
          .map((seg) => seg.trim().split(/\s+/).slice(1).join(' ').trim())
          .filter(Boolean);
        if (!bizType && cols[0]) bizType = cols[0];
        if (!bizItem && cols[1]) bizItem = cols[1];
      }
    }

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
