import { supabase } from './supabaseClient';
import type { CustomerRecord } from '../types';

export type CustomerDraft = Omit<CustomerRecord, 'id' | 'owner_id' | 'created_at'>;

export async function fetchCustomers(): Promise<CustomerRecord[]> {
  const { data, error } = await supabase.from('customers').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as CustomerRecord[];
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
