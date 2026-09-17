import { supabase } from './supabaseClient';

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  biz_no: string;
  ceo: string;
  is_admin: boolean;
  balance: number;
  created_at: string;
  last_sign_in_at: string | null;
}

export async function fetchSubscribers(): Promise<Subscriber[]> {
  const { data, error } = await supabase.rpc('admin_list_subscribers');
  if (error) throw error;
  return (data ?? []) as Subscriber[];
}
