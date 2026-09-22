import { supabase } from './supabaseClient';
import type { Wallet, WalletTransaction } from '../types/wallet';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3002';

// 관리자 계정에는 "본인 지갑만" 정책 외에 "관리자는 전체 지갑 조회 가능" 정책도 함께 걸려있어서,
// owner_id로 걸러주지 않으면 전체 회원의 지갑/거래내역이 섞여서 나온다(관리자 화면에서 잔액이
// 0으로 보이거나 다른 회원 내역이 보이는 원인). 반드시 현재 로그인한 사용자 id로 직접 필터링한다.
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

export async function fetchMyWallet(): Promise<Wallet> {
  const uid = await currentUserId();
  const { data, error } = await supabase.from('wallets').select('*').eq('owner_id', uid).maybeSingle();
  if (error) throw error;
  return (data ?? { owner_id: uid, balance: 0, updated_at: new Date().toISOString() }) as Wallet;
}

export async function fetchMyTransactions(): Promise<WalletTransaction[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WalletTransaction[];
}

export async function requestDeposit(amount: number, depositorName: string): Promise<WalletTransaction> {
  const { data, error } = await supabase.rpc('request_wallet_deposit', {
    p_amount: amount,
    p_depositor_name: depositorName,
  });
  if (error) throw error;
  return data as WalletTransaction;
}

export async function requestRefund(amount: number, accountInfo: string): Promise<WalletTransaction> {
  const { data, error } = await supabase.rpc('request_wallet_refund', {
    p_amount: amount,
    p_account_info: accountInfo,
  });
  if (error) throw error;
  return data as WalletTransaction;
}

export async function confirmTossPayment(paymentKey: string, orderId: string, amount: number): Promise<{ balance: number | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${BACKEND_URL}/api/payments/toss/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `결제 확인 실패 (${res.status})`);
  return body;
}

// --- 관리자 전용 ---

export async function fetchPendingDeposits(): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('type', 'deposit_request')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WalletTransaction[];
}

export async function approveDeposit(transactionId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_wallet_deposit', { p_transaction_id: transactionId });
  if (error) throw error;
}

export async function rejectDeposit(transactionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_wallet_deposit', { p_transaction_id: transactionId, p_reason: reason });
  if (error) throw error;
}

export async function fetchPendingRefunds(): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('type', 'refund_request')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WalletTransaction[];
}

export async function approveRefund(transactionId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_wallet_refund', { p_transaction_id: transactionId });
  if (error) throw error;
}

export async function rejectRefund(transactionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_wallet_refund', { p_transaction_id: transactionId, p_reason: reason });
  if (error) throw error;
}
