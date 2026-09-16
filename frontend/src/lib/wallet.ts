import { supabase } from './supabaseClient';
import type { Wallet, WalletTransaction } from '../types/wallet';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3002';

export async function fetchMyWallet(): Promise<Wallet> {
  const { data, error } = await supabase.from('wallets').select('*').single();
  if (error) throw error;
  return data as Wallet;
}

export async function fetchMyTransactions(): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
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
