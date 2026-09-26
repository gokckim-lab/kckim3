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

-- ----------------------------------------------------------------------
-- 나이스페이 가상계좌 충전: 사장님이 자리를 비워도 입금이 자동으로 잔액에
-- 반영되도록(관리자 수동승인 불필요), 충전 신청마다 일회성 계좌번호를 발급하고
-- 나이스페이가 입금 완료를 웹훅으로 통보하면 자동으로 크레딧한다.
-- ----------------------------------------------------------------------
create table if not exists public.nicepay_virtual_accounts (
  moid text primary key,             -- 가맹점 주문번호 (우리가 생성)
  tid text not null,                 -- 나이스페이 거래 ID
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  bank_name text,
  account_num text,
  expire_date date,
  status text not null default 'issued' check (status in ('issued', 'paid', 'expired', 'canceled')),
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists nicepay_va_owner_idx on public.nicepay_virtual_accounts(owner_id);

alter table public.nicepay_virtual_accounts enable row level security;

drop policy if exists "nicepay_va: owner read" on public.nicepay_virtual_accounts;
create policy "nicepay_va: owner read" on public.nicepay_virtual_accounts
  for select using (auth.uid() = owner_id);

-- insert/update는 backend(service_role) 전용 (발급 API 호출 시, 입금 웹훅 수신 시).

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

-- ----------------------------------------------------------------------
-- 관리자용: 전체 가입자 목록 (가입일/최근 로그인은 profiles에 없고 auth.users에만
-- 있어서, SECURITY DEFINER 함수로 auth.users를 조인해 관리자에게만 노출한다.
-- ----------------------------------------------------------------------
create or replace function public.admin_list_subscribers()
returns table (
  id uuid,
  email text,
  name text,
  biz_no text,
  ceo text,
  is_admin boolean,
  balance numeric,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin) then
    raise exception '관리자만 조회할 수 있습니다.';
  end if;

  return query
    select
      p.id,
      coalesce(nullif(p.email, ''), u.email) as email,
      p.name,
      p.biz_no,
      p.ceo,
      p.is_admin,
      coalesce(w.balance, 0) as balance,
      u.created_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.wallets w on w.owner_id = p.id
    order by u.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------
-- 포인트 환불 신청: 충전한 잔액을 실제 계좌로 돌려받고 싶을 때 사용.
-- 무통장입금 승인 흐름과 대칭으로, 가입자가 신청 -> 관리자가 실제 계좌이체
-- 해준 뒤 승인하면 그제서야 잔액이 차감된다(임의로 소멸시키지 않는다).
-- ----------------------------------------------------------------------
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('deposit_request', 'issue_deduct', 'refund', 'refund_request'));

alter table public.wallet_transactions
  add column if not exists refund_account_info text default '';

drop policy if exists "wallet_tx: owner insert refund request" on public.wallet_transactions;
create policy "wallet_tx: owner insert refund request" on public.wallet_transactions
  for insert with check (
    auth.uid() = owner_id and type = 'refund_request' and status = 'pending'
  );

-- 환불 신청 (프론트에서 authenticated 사용자가 직접 호출)
create or replace function public.request_wallet_refund(p_amount numeric, p_account_info text)
returns public.wallet_transactions
language plpgsql security invoker as $$
declare
  v_row public.wallet_transactions;
  v_balance numeric;
begin
  if p_amount <= 0 then
    raise exception '환불 금액은 0보다 커야 합니다.';
  end if;
  select balance into v_balance from public.wallets where owner_id = auth.uid();
  if v_balance is null or p_amount > v_balance then
    raise exception '잔액보다 큰 금액은 환불 신청할 수 없습니다.';
  end if;

  insert into public.wallet_transactions (owner_id, type, amount, status, refund_account_info)
  values (auth.uid(), 'refund_request', p_amount, 'pending', coalesce(p_account_info, ''))
  returning * into v_row;
  return v_row;
end;
$$;

-- 관리자 승인: 실제로 계좌이체 해준 뒤 눌러야 한다. 그 순간 잔액이 차감된다.
create or replace function public.approve_wallet_refund(p_transaction_id uuid)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.wallet_transactions;
  v_balance numeric;
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin) then
    raise exception '관리자만 승인할 수 있습니다.';
  end if;

  select * into v_tx from public.wallet_transactions where id = p_transaction_id for update;
  if v_tx is null then
    raise exception '해당 환불 신청을 찾을 수 없습니다.';
  end if;
  if v_tx.status <> 'pending' or v_tx.type <> 'refund_request' then
    raise exception '이미 처리된 신청입니다.';
  end if;

  select balance into v_balance from public.wallets where owner_id = v_tx.owner_id for update;
  if v_balance is null or v_balance < v_tx.amount then
    raise exception '잔액이 부족하여 승인할 수 없습니다.';
  end if;

  update public.wallets set balance = balance - v_tx.amount, updated_at = now()
  where owner_id = v_tx.owner_id;

  update public.wallet_transactions
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_transaction_id
  returning * into v_tx;

  return v_tx;
end;
$$;

-- 관리자 반려
create or replace function public.reject_wallet_refund(p_transaction_id uuid, p_reason text)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_tx public.wallet_transactions;
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin) then
    raise exception '관리자만 반려할 수 있습니다.';
  end if;

  update public.wallet_transactions
  set status = 'rejected', approved_by = auth.uid(), approved_at = now(), memo = coalesce(p_reason, '')
  where id = p_transaction_id and status = 'pending' and type = 'refund_request'
  returning * into v_tx;

  if v_tx is null then
    raise exception '해당 환불 신청을 찾을 수 없거나 이미 처리되었습니다.';
  end if;
  return v_tx;
end;
$$;

grant execute on function public.admin_list_subscribers() to authenticated;

-- ----------------------------------------------------------------------
-- 보안 수정: 포인트 적립/차감/환급 함수는 backend(service_role)에서만 호출한다.
-- Postgres 함수는 기본적으로 모든 사용자(PUBLIC)가 실행할 수 있어서, 잠그지 않으면
-- 로그인한 누구나 supabase.rpc('wallet_credit', ...)로 자기 포인트를 마음대로 늘릴 수 있다.
-- ----------------------------------------------------------------------
revoke execute on function public.wallet_credit(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.wallet_try_deduct(uuid, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.wallet_refund(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, numeric, text) to service_role;
grant execute on function public.wallet_try_deduct(uuid, numeric, uuid) to service_role;
grant execute on function public.wallet_refund(uuid, numeric, uuid) to service_role;

-- ----------------------------------------------------------------------
-- 입금 처리 원자화: "입금완료 표시"와 "포인트 적립"을 한 트랜잭션으로 묶는다.
-- 예전에는 상태를 먼저 paid로 바꾼 뒤 적립했기 때문에, 적립이 실패하면 나이스가 재통보해도
-- "이미 처리됨"으로 무시되어 돈은 받고 포인트는 못 받는 상태가 될 수 있었다.
-- ----------------------------------------------------------------------
create or replace function public.credit_virtual_account_deposit(p_moid text, p_amount numeric, p_memo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_va public.nicepay_virtual_accounts;
begin
  select * into v_va from public.nicepay_virtual_accounts where moid = p_moid for update;
  if v_va is null then return 'not_found'; end if;
  if v_va.status = 'paid' then return 'already_paid'; end if;
  if v_va.amount <> p_amount then return 'amount_mismatch'; end if;

  perform public.wallet_credit(v_va.owner_id, p_amount, p_memo);
  update public.nicepay_virtual_accounts set status = 'paid', paid_at = now() where moid = p_moid;
  return 'credited';
end;
$$;

create or replace function public.credit_card_payment(p_tid text, p_order_id text, p_owner_id uuid, p_amount numeric, p_memo text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  insert into public.nicepay_payments (tid, order_id, owner_id, amount)
  values (p_tid, p_order_id, p_owner_id, p_amount)
  on conflict (tid) do nothing;
  if not found then return 'already_paid'; end if;

  perform public.wallet_credit(p_owner_id, p_amount, p_memo);
  return 'credited';
end;
$$;

revoke execute on function public.credit_virtual_account_deposit(text, numeric, text) from public, anon, authenticated;
revoke execute on function public.credit_card_payment(text, text, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.credit_virtual_account_deposit(text, numeric, text) to service_role;
grant execute on function public.credit_card_payment(text, text, uuid, numeric, text) to service_role;

-- ----------------------------------------------------------------------
-- 탈퇴 회원의 거래기록 보존: 충전/결제 내역(매출 증빙 관련 자료)은 법령상 5년간 보관해야 하므로,
-- 회원 탈퇴로 원본 행이 cascade 삭제되기 전에 backend가 이 테이블로 사본을 남긴다.
-- RLS를 켜고 정책을 두지 않아 service_role(backend)만 읽고 쓸 수 있다.
-- ----------------------------------------------------------------------
create table if not exists public.account_deletion_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  profile jsonb,
  wallet_transactions jsonb,
  nicepay_payments jsonb,
  nicepay_virtual_accounts jsonb,
  deleted_at timestamptz not null default now(),
  retain_until date not null default ((current_date + interval '5 years')::date)
);
alter table public.account_deletion_archive enable row level security;

-- ----------------------------------------------------------------------
-- 세금계산서 발행취소 / 수정세금계산서: 발행취소(cancelIssue)는 국세청 전송 전에만 가능하고,
-- 이미 전송된 건은 사유코드 1~6(기재사항 착오정정/공급가액 변동/환입/계약의 해제/
-- 내국신용장 사후개설/착오에 의한 이중발급)으로 수정세금계산서를 새로 발행해야 한다.
-- 수정세금계산서는 원본을 가리키는 별도의 documents 행(revises_document_id)으로 만들고,
-- 발행 시 원본의 popbill_nts_confirm_num을 팝빌 orgNTSConfirmNum으로 함께 보낸다.
-- ----------------------------------------------------------------------
alter table public.documents
  add column if not exists revises_document_id uuid references public.documents(id) on delete set null,
  add column if not exists modify_code smallint check (modify_code between 1 and 6);

alter table public.documents drop constraint if exists documents_popbill_status_check;
alter table public.documents add constraint documents_popbill_status_check
  check (popbill_status in ('NONE', 'ISSUED', 'FAILED', 'CANCELED'));
