# Birdie Bill

도소매업 사업자를 위한 견적서 · 주문서 · 거래명세서 · 세금계산서 발급 서비스.

- 견적서 → 주문서 → 거래명세서: **무료**, 이전 문서 내용을 그대로 불러와 다음 문서를 만듭니다("변환" 버튼).
- 세금계산서 **발행**(팝빌 연동): 선불로 충전한 **포인트 지갑**에서 건당 포인트가 차감됩니다.
  - 여러 도소매업체가 각자 가입해서 쓰는 구조(멀티테넌트)이며, 업체별 데이터는 Supabase RLS로 격리됩니다.
  - 포인트 충전은 무통장입금 신청 → 관리자 승인 방식입니다 (PG 카드결제 연동 전 기본 흐름).

## 구조

```
BirdieBill/
├─ frontend/   React(Vite) + Tailwind + Supabase Auth/DB
├─ backend/    Node/Express, 팝빌 SecretKey를 들고 있는 유일한 서버
└─ supabase/schema.sql   DB 스키마 + RLS + 지갑 관련 함수
```

팝빌 SecretKey는 브라우저에 노출되면 안 되므로, **세금계산서 발행만** backend를 거칩니다.
그 외 모든 데이터(회사정보/거래처/품목/문서/포인트지갑)는 프론트엔드가 Supabase에 직접 접근합니다(RLS로 보호).

## 1. Supabase 프로젝트 준비

1. https://supabase.com 에서 새 프로젝트 생성
2. 프로젝트의 **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql) 전체 내용을 붙여넣고 실행
3. **Project Settings → API** 에서 다음 값을 복사해둡니다
   - `Project URL`
   - `anon public` 키 (프론트엔드용)
   - `service_role` 키 (백엔드 전용, **절대 프론트엔드에 넣지 마세요**)

## 2. 첫 관리자 계정 만들기

1. 프론트엔드를 실행하고 회원가입으로 계정을 하나 만듭니다 (이 계정이 우리 서비스 운영자/관리자 계정)
2. Supabase **Authentication → Users** 에서 방금 만든 계정의 `User UID`를 복사
3. SQL Editor에서 실행:
   ```sql
   update public.profiles set is_admin = true where id = '복사한-UID';
   ```
4. 이제 이 계정으로 로그인하면 상단 메뉴에 **"입금승인(관리자)"** 메뉴가 보입니다. 여기서 다른 도소매업체들의 포인트 충전 신청을 승인/반려합니다.

## 3. backend 설정

```bash
cd backend
cp .env.example .env   # 이미 .env 파일이 있다면 값만 채우면 됩니다
```

`.env`에 다음을 채웁니다:

| 변수 | 설명 |
|---|---|
| `POPBILL_LINK_ID`, `POPBILL_SECRET_KEY` | 팝빌 연동 계정 정보 (이미 입력되어 있음) |
| `POPBILL_CORP_NUM` | **필수** — 팝빌에 연동회원으로 가입된 우리 회사(공급자)의 사업자등록번호(하이픈 제외 10자리). 이게 없으면 발행이 되지 않습니다. |
| `POPBILL_IS_TEST` | 테스트: `true`, 실제 발행(과금 발생): `false` |
| `POPBILL_ISSUE_PRICE` | 세금계산서 1건 발행마다 입점업체 포인트 지갑에서 차감할 금액(원). 기본 200 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 위 1단계에서 복사한 값 |
| `PORT` | 기본 3002 (이 PC에서 3001을 다른 프로세스가 이미 쓰고 있어 3002로 지정했습니다) |

실행:
```bash
npm install   # 최초 1회
npm run dev
```
`http://localhost:3002/api/health` 가 `{"ok":true}` 를 반환하면 정상입니다.

## 4. frontend 설정

```bash
cd frontend
cp .env.example .env
```
`.env`에 Supabase `Project URL` / `anon public` 키를 채웁니다.

실행:
```bash
npm install   # 최초 1회
npm run dev
```
`http://localhost:5173` 접속.

## 5. 팝빌 테스트

- 테스트 계정: https://test.popbill.com 에서 연동회원 가입 후 `POPBILL_CORP_NUM`에 테스트용 사업자번호를 넣고 `POPBILL_IS_TEST=true`로 발행 테스트를 해보세요.
- 실제(과금) 발행으로 전환하려면 팝빌 정식 연동회원 가입 + `POPBILL_IS_TEST=false` 로 변경합니다.
- 포인트가 부족하면 팝빌 자체에서 발행이 거부됩니다. 이건 **우리 서비스의 지갑(wallets)과는 별개**로, 팝빌 계정 자체에 충전해야 하는 포인트입니다 (전자세금계산서 국세청 신고 비용). 반면 `wallets.balance`는 우리 서비스가 입점 업체에게 받는 이용요금입니다.

## 이번에 고친 버그

기존 `Birdie-Bill-Restored-Final.html`(단일 파일 프로토타입)에서 "사업자등록증 PDF 업로드해도 칸이 안 채워지는" 문제의 원인은 PDF 텍스트 추출 시 줄바꿈 정보 없이 페이지 전체를 한 줄로 이어붙여서, 상호/대표자/주소 등을 줄 단위로 구분하는 정규식이 전부 실패했기 때문입니다.
`frontend/src/lib/bizCardExtract.ts`에서 각 텍스트 조각의 y좌표로 줄을 복원하도록 고쳤고, 라벨 뒤 값 추출 정규식의 교대(alternation) 우선순위 버그도 함께 고쳤습니다.

## 아직 안 된 것 / 다음 단계로 고려할 것

- **카드결제(PG) 연동**: 지금은 포인트 충전이 "무통장입금 신청 → 관리자 수동 승인"입니다. 토스페이먼츠/이니시스 등 PG 가맹점 계정을 만드시면 자동 충전으로 바꿀 수 있습니다.
- **이메일 발송**: 발행된 세금계산서를 거래처에 이메일로 자동 발송하는 기능(`taxinvoiceService.sendEmail`)은 아직 연결하지 않았습니다.
- **다중 사업장**: 한 계정이 여러 사업자(회사)를 관리하는 기능은 없습니다(1계정 = 1회사).
