import { supabase } from './supabaseClient';
import type { CustomerRecord } from '../types';

export type CustomerDraft = Omit<CustomerRecord, 'id' | 'owner_id' | 'created_at'>;

export async function fetchCustomers(): Promise<CustomerRecord[]> {
  const { data, error } = await supabase.from('customers').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as CustomerRecord[];
}

// 최근에 문서를 작성한 거래처가 앞에 오도록 거래처 id를 최근 거래 순으로 돌려준다.
export async function fetchRecentCustomerIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('customer_id')
    .not('customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return [...new Set((data ?? []).map((d) => d.customer_id as string))];
}

export function sortByRecent(list: CustomerRecord[], recentIds: string[]): CustomerRecord[] {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return [...list].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.name.localeCompare(b.name, 'ko'));
}

export function matchesCustomer(c: CustomerRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    c.name.toLowerCase().includes(q) ||
    (c.ceo || '').toLowerCase().includes(q) ||
    (digits.length >= 3 && (c.biz_no || '').replace(/\D/g, '').includes(digits))
  );
}

export async function createCustomer(ownerId: string, draft: CustomerDraft): Promise<CustomerRecord> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...draft, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as CustomerRecord;
}

export async function updateCustomer(id: string, draft: Partial<CustomerDraft>): Promise<void> {
  const { error } = await supabase.from('customers').update(draft).eq('id', id);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}
