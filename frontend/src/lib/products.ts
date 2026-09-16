import { supabase } from './supabaseClient';
import type { ProductRecord } from '../types';

export type ProductDraft = Omit<ProductRecord, 'id' | 'owner_id' | 'created_at'>;

export async function fetchProducts(): Promise<ProductRecord[]> {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as ProductRecord[];
}

export async function createProduct(ownerId: string, draft: ProductDraft): Promise<ProductRecord> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...draft, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as ProductRecord;
}

export async function updateProduct(id: string, draft: Partial<ProductDraft>): Promise<void> {
  const { error } = await supabase.from('products').update(draft).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
