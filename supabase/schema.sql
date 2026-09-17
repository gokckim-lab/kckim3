-- Birdie Bill: 견적서 / 주문서 / 거래명세서 / 세금계산서 스키마
-- Supabase 프로젝트의 SQL Editor 에 그대로 붙여넣어 실행하세요.

create extension if not exists "pgcrypto";

-- 1) 공급자(내 회사) 프로필: auth.users 1:1
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  biz_no text default '',
  name text default '',
  ceo text default '',
  address text default '',
  biz_type text default '',
  biz_item text default '',
  email text default '',
  tel text default '',
  contact text default '',
  bank_name text default '',
  bank_account text default '',
  bank_holder text default '',
  -- true인 계정만 입금(충전) 승인 화면(/admin/deposits)에 접근할 수 있다.
  -- 최초 관리자는 가입 후 SQL Editor에서 직접 true로 바꿔줘야 한다:
  --   update public.profiles set is_admin = true where id = '<내 user id>';
  is_admin boolean not null default false,
  updated_at timestamptz default now()
);

-- 2) 거래처(공급받는자)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  biz_no text default '',
  name text not null,
  ceo text default '',
  address text default '',
  biz_type text default '',
  biz_item text default '',
  email text default '',
  tel text default '',
  contact text default '',
  memo text default '',
  created_at timestamptz default now()
);
create index if not exists customers_owner_idx on public.customers(owner_id);

-- 3) 품목(자주 쓰는 상품)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  spec text default '',
  unit text default '',
  unit_price numeric default 0,
  memo text default '',
  created_at timestamptz default now()
);
create index if not exists products_owner_idx on public.products(owner_id);

-- 4) 문서 (견적서/주문서/거래명세서/세금계산서)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('quote', 'order', 'delivery', 'tax_invoice')),
  doc_no text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'canceled')),

  customer_id uuid references public.customers(id) on delete set null,
  supplier jsonb not null default '{}'::jsonb,   -- 발급 시점 공급자 정보 스냅샷
  customer jsonb not null default '{}'::jsonb,   -- 발급 시점 공급받는자 정보 스냅샷

  issue_date date not null default current_date,
  due_date date,
  memo text default '',

  supply_total numeric not null default 0,
  tax_total numeric not null default 0,
  grand_total numeric not null default 0,

  -- 이 문서가 어떤 문서로부터 변환되었는지 (견적서 -> 주문서 -> 거래명세서 -> 세금계산서)
  source_document_id uuid references public.documents(id) on delete set null,

  -- 팝빌 세금계산서 발행 상태 (type = 'tax_invoice' 인 문서에서만 사용)
  popbill_status text default 'NONE' check (popbill_status in ('NONE', 'ISSUED', 'FAILED')),
  popbill_mgt_key text,
  popbill_nts_confirm_num text,
  popbill_issued_at timestamptz,
  popbill_last_error text,

  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (owner_id, doc_no)
);
create index if not exists documents_owner_idx on public.documents(owner_id);
create index if not exists documents_type_idx on public.documents(type);

-- 5) 문서 품목 라인
create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  sort_order int not null default 0,
  name text default '',
  spec text default '',
  qty numeric default 1,
  unit_price numeric default 0,
  supply_price numeric default 0,
  tax numeric default 0,
  remark text default ''
);
create index if not exists document_items_document_idx on public.document_items(document_id);

-- ----------------------------------------------------------------------
-- Row Level Security: 로그인한 본인 데이터만 접근 가능
-- ----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;

-- profiles 테이블 정책 안에서 profiles를 다시 조회하면 RLS가 재귀적으로 자기 자신을
-- 평가하려다 "infinite recursion detected in policy" 에러가 난다.
-- SECURITY DEFINER 함수로 감싸서 RLS를 우회한 채 is_admin 값만 조회하도록 한다.
create or replace function public.is_admin_user()
returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles: self" on public.profiles;
create policy "profiles: self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles: admin read all" on public.profiles;
create policy "profiles: admin read all" on public.profiles
  for select using (public.is_admin_user());

drop policy if exists "customers: owner" on public.customers;
create policy "customers: owner" on public.customers
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "products: owner" on public.products;
create policy "products: owner" on public.products
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "documents: owner" on public.documents;
create policy "documents: owner" on public.documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "document_items: via document owner" on public.document_items;
create policy "document_items: via document owner" on public.document_items
  for all using (
    exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  );

-- 신규 가입 시 profiles + wallets 행 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  insert into public.wallets (owner_id, balance) values (new.id, 0)
  on conflict (owner_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------
-- 선불 포인트(지갑): 견적/주문/거래명세서는 무료, 세금계산서 "발행" 시에만
-- 아래 wallets.balance 에서 건당 비용이 차감된다. 충전은 무통장입금 신청 ->
-- 관리자 승인 방식이다 (PG 결제 연동 전 기본 흐름).
-- ----------------------------------------------------------------------
create table if not exists public.wallets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit_request', 'issue_deduct', 'refund')),
  amount numeric not null,               -- 충전 신청/발행 차감은 양수, 환불은 양수(잔액에 더해짐)
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  depositor_name text default '',        -- 무통장입금 시 입금자명 (충전 신청 시에만 사용)
  memo text default '',
  related_document_id uuid references public.documents(id) on delete set null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists wallet_tx_owner_idx on public.wallet_transactions(owner_id);
create index if not exists wallet_tx_status_idx on public.wallet_transactions(status);

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "wallets: owner read" on public.wallets;
create policy "wallets: owner read" on public.wallets
  for select using (auth.uid() = owner_id);

drop policy if exists "wallets: admin read all" on public.wallets;
create policy "wallets: admin read all" on public.wallets
  for select using (public.is_admin_user());

-- balance는 아래 SECURITY DEFINER 함수(approve/deduct/refund)로만 변경한다.
-- 사용자가 직접 update/insert 하지 못하도록 별도 write 정책을 두지 않는다.

drop policy if exists "wallet_tx: owner read own" on public.wallet_transactions;
create policy "wallet_tx: owner read own" on public.wallet_transactions
  for select using (auth.uid() = owner_id);

drop policy if exists "wallet_tx: owner insert deposit request" on public.wallet_transactions;
create policy "wallet_tx: owner insert deposit request" on public.wallet_transactions
  for insert with check (
    auth.uid() = owner_id and type = 'deposit_request' and status = 'pending'
  );

drop policy if exists "wallet_tx: admin read all" on public.wallet_transactions;
create policy "wallet_tx: admin read all" on public.wallet_transactions
  for select using (public.is_admin_user());

-- 입금 충전 신청 (프론트에서 authenticated 사용자가 직접 호출)
create or replace function public.request_wallet_deposit(p_amount numeric, p_depositor_name text)
returns public.wallet_transactions
language plpgsql security invoker as $$
declare
  v_row public.wallet_transactions;
begin
  if p_amount <= 0 then
    raise exception '충전 금액은 0보다 커야 합니다.';
  end if;
  insert into public.wallet_transactions (owner_id, type, amount, status, depositor_name)
  values (auth.uid(), 'deposit_request', p_amount, 'pending', coalesce(p_depositor_name, ''))
  returning * into v_row;
  return v_row;
end;
$$;

-- 관리자 승인: 대기중인 입금 신청을 잔액에 반영한다.
create or replace function public.approve_wallet_deposit(p_transaction_id uuid)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.wallet_transactions;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 승인할 수 있습니다.';
  end if;

  select * into v_tx from public.wallet_transactions where id = p_transaction_id for update;
  if v_tx is null then
    raise exception '해당 충전 신청을 찾을 수 없습니다.';
  end if;
  if v_tx.status <> 'pending' or v_tx.type <> 'deposit_request' then
    raise exception '이미 처리된 신청입니다.';
  end if;

  insert into public.wallets (owner_id, balance) values (v_tx.owner_id, 0)
  on conflict (owner_id) do nothing;

  update public.wallets set balance = balance + v_tx.amount, updated_at = now()
  where owner_id = v_tx.owner_id;

  update public.wallet_transactions
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_transaction_id
  returning * into v_tx;

  return v_tx;
end;
$$;

-- 관리자 반려
create or replace function public.reject_wallet_deposit(p_transaction_id uuid, p_reason text)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.wallet_transactions;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception '관리자만 반려할 수 있습니다.';
  end if;

  update public.wallet_transactions
  set status = 'rejected', approved_by = auth.uid(), approved_at = now(), memo = coalesce(p_reason, '')
  where id = p_transaction_id and status = 'pending'
  returning * into v_tx;

  if v_tx is null then
    raise exception '해당 충전 신청을 찾을 수 없거나 이미 처리되었습니다.';
  end if;
  return v_tx;
end;
$$;

-- 세금계산서 발행 차감 (service_role 백엔드 전용: 잔액이 충분할 때만 원자적으로 차감)
create or replace function public.wallet_try_deduct(p_owner_id uuid, p_amount numeric, p_document_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  insert into public.wallets (owner_id, balance) values (p_owner_id, 0)
  on conflict (owner_id) do nothing;

  update public.wallets set balance = balance - p_amount, updated_at = now()
  where owner_id = p_owner_id and balance >= p_amount
  returning balance into v_balance;

  if v_balance is null then
    return null; -- 잔액 부족
  end if;

  insert into public.wallet_transactions (owner_id, type, amount, status, related_document_id)
  values (p_owner_id, 'issue_deduct', p_amount, 'approved', p_document_id);

  return v_balance;
end;
$$;

-- 팝빌 발행 실패 시 차감분 환불 (service_role 백엔드 전용)
create or replace function public.wallet_refund(p_owner_id uuid, p_amount numeric, p_document_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  update public.wallets set balance = balance + p_amount, updated_at = now()
  where owner_id = p_owner_id
  returning balance into v_balance;

  insert into public.wallet_transactions (owner_id, type, amount, status, related_document_id, memo)
  values (p_owner_id, 'refund', p_amount, 'approved', p_document_id, '발행 실패로 인한 환불');

  return v_balance;
end;
$$;

-- ----------------------------------------------------------------------
-- 카드결제(나이스페이) 자동충전. 무통장입금(관리자 승인) 방식과 별개로,
-- 결제 승인이 되는 즉시 wallets.balance 에 자동 반영된다.
-- (예전에 토스페이먼츠로 시작했다가 연회비 문제로 나이스페이로 교체함.
--  기존 toss_payments 테이블은 과거 기록 보존을 위해 남겨두되 더 이상 쓰지 않는다.)
-- ----------------------------------------------------------------------

create table if not exists public.toss_payments (
  payment_key text primary key,
  order_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz default now()
);
create index if not exists toss_payments_owner_idx on public.toss_payments(owner_id);

alter table public.toss_payments enable row level security;

drop policy if exists "toss_payments: owner read" on public.toss_payments;
create policy "toss_payments: owner read" on public.toss_payments
  for select using (auth.uid() = owner_id);

-- 이미 처리한 결제(tid)를 기록해서, returnUrl 콜백이 중복 도착해도
-- 포인트가 두 번 적립되지 않도록 막는다(멱등성 보장).
create table if not exists public.nicepay_payments (
  tid text primary key,
  order_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz default now()
);
create index if not exists nicepay_payments_owner_idx on public.nicepay_payments(owner_id);

alter table public.nicepay_payments enable row level security;

drop policy if exists "nicepay_payments: owner read" on public.nicepay_payments;
create policy "nicepay_payments: owner read" on public.nicepay_payments
  for select using (auth.uid() = owner_id);

-- insert는 항상 backend(service_role)에서만 하므로(카드결제 승인 API를 서버에서만 호출)
-- 별도의 insert 정책을 두지 않는다 = 일반 사용자는 직접 쓸 수 없다.

-- 포인트 적립 (service_role 백엔드 전용: 카드결제 승인 후 호출)
create or replace function public.wallet_credit(p_owner_id uuid, p_amount numeric, p_memo text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  insert into public.wallets (owner_id, balance) values (p_owner_id, 0)
  on conflict (owner_id) do nothing;

  update public.wallets set balance = balance + p_amount, updated_at = now()
  where owner_id = p_owner_id
  returning balance into v_balance;

  insert into public.wallet_transactions (owner_id, type, amount, status, memo)
  values (p_owner_id, 'deposit_request', p_amount, 'approved', coalesce(p_memo, ''));

  return v_balance;
end;
$$;
