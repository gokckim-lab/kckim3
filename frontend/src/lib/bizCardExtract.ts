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

// 흐릿한 스캔본은 OCR이 한글 구간 전체를 엉뚱한 영문/기호로 "환각" 인식하기도 한다
// (예: "청암네트웍스(주)" -> "BLUEIA(F)", "서울특별시" -> "ASSEN"). 그런 값을 그대로 보여주면
// 오인식된 정보를 사실로 착각하게 되므로, 한글이 하나도 없는 값은 버리는 게 더 안전하다.
const hasHangul = (s: string) => /[가-힣]/.test(s);

// 값 맨 앞에 그렇게 환각 인식된 영문/기호 토큰이 붙고 그 뒤로는 정상적으로 한글이 이어지는
// 경우(예: "ASSEN 송파구 송파대로36가길 7(송파동, 702호)")에는, 뒤쪽 한글 부분이라도 살릴 수
// 있도록 맨 앞의 "한글이 섞이지 않은" 첫 토큰만 잘라낸다.
function stripLeadingGarbageToken(s: string): string {
  const tokens = s.split(/\s+/);
  while (tokens.length > 1 && tokens[0] && !hasHangul(tokens[0])) tokens.shift();
  return tokens.join(' ').trim();
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
    // 같은 줄 오른쪽에 다른 칸(종사업장 등)이 넓은 공백을 사이에 두고 이어 붙는 경우가 있어,
    // ceo와 마찬가지로 공백 2칸 이상을 열 경계로 보고 그 앞부분만 상호 값으로 쓴다.
    name = name.split(/\s{2,}|\t/)[0].trim();
    // 상호 전체가 영문/기호로 환각 인식된 경우(한글이 하나도 없음) 오인식 값을 보여주지 않는다.
    if (!hasHangul(name)) name = '';

    let ceo = findLabelValueWithPrevFallback(
      lines,
      '성\\s*명\\s*(?:\\(\\s*대\\s*표\\s*자\\s*\\))?|대\\s*표\\s*자\\s*성\\s*명(?:\\([^)]*\\))?|대\\s*표\\s*자'
    );
    // 값 뒤에 같은 줄로 다음 항목(생년월일 등)이 넓은 공백을 사이에 두고 이어 붙는 경우가
    // 많아서, 공백 2칸 이상을 열 경계로 보고 그 앞부분만 잘라 쓴다.
    ceo = ceo.replace(/^\([^)]*\)\s*/, '').split(/\s{2,}|\t/)[0].trim();
    if (!hasHangul(ceo)) ceo = '';

    let address = findLabelValueWithPrevFallback(
      lines,
      '사\\s*업\\s*장\\s*소\\s*재\\s*지|소\\s*재\\s*지|본\\s*점\\s*소\\s*재\\s*지'
    );
    // 라벨 바로 뒤 첫 토큰(보통 시/도 이름)만 환각 인식되고 나머지 주소는 멀쩡한 경우가 있어,
    // 완전히 버리는 대신 그 선행 토큰만 잘라내고 살릴 수 있는 부분은 살린다.
    address = stripLeadingGarbageToken(address);
    if (!address || !hasHangul(address)) {
      const m = normalized.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]{5,60}/);
      if (m) address = m[0].trim();
      else if (!hasHangul(address)) address = '';
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
    // 흐릿한 사진 스캔본은 "류" 한 글자만 다른 글자로 잘못 읽혀도(예: "종류"→"종2") 정확히 일치하는
    // "사업의종류"를 못 찾으므로, "류"는 있으면 좋고 없어도 되는 정도로만 요구한다.
    if (!bizType || !bizItem) {
      const bizRowAnchor = /사\s*업\s*의\s*종\s*류?\s*[:：]?\s*/;
      const bizRow = lines.find((l) => bizRowAnchor.test(l));
      if (bizRow) {
        // "사업의 종류" 라벨 자체를 떼어내고 나면 두 가지 모양이 남는다:
        //  1) 체크박스 글자가 깨진 채 남아있는 경우 — "[FH 도매및소매업     [총록| 전자상거래 소매업"
        //     (업태/종목 값 사이에 넓은 공백이 있고, 각 칸 맨 앞에 깨진 체크박스 토큰이 붙어있다)
        //  2) 체크박스가 아예 통째로 사라진 경우 — "도소매 컬퓨터및소모품"
        //     (업태 값과 종목 값 사이에 공백 한 칸만 있어 구분할 표시가 없다. 업태는 항상
        //      "도매/소매/도소매/서비스/제조업" 같은 짧은 한 단어이므로 첫 단어를 업태로 본다)
        const stripped = bizRow.replace(bizRowAnchor, '').trim();
        const segments = stripped.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
        const cols =
          segments.length >= 2
            ? segments.map((seg) => seg.split(/\s+/).slice(1).join(' ').trim())
            : (() => {
                const parts = stripped.split(/\s+/);
                return [parts[0] ?? '', parts.slice(1).join(' ')];
              })();
        // 흐릿한 사진은 라벨/체크박스 자리뿐 아니라 값 자체도 OCR이 알파벳·기호 쓰레기로
        // 뭉개버릴 수 있다(예: "도매및소매업" → "SHYLA"). 한글이 하나도 없는 칸은 사업 종류로
        // 보기 어려우므로 자리는 유지한 채 빈칸으로 둬서(오인식된 값을 채우는 대신) 사용자가
        // 직접 입력하게 한다 — 앞 칸이 쓰레기라고 뒤 칸(종목) 값을 업태 자리로 당겨쓰면 안 된다.
        const cleaned = cols.map((v) => (v && hasHangul(v) ? v : ''));
        if (!bizType && cleaned[0]) bizType = cleaned[0];
        if (!bizItem && cleaned[1]) bizItem = cleaned[1];
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
