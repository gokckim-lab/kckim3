import { supabase } from './supabaseClient';
import type { PartyInfo } from '../types';

export interface CompanyProfile extends PartyInfo {
  bank_name: string;
  bank_account: string;
  bank_holder: string;
}

export async function fetchProfile(userId: string): Promise<CompanyProfile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return {
    bizNo: data.biz_no || '',
    name: data.name || '',
    ceo: data.ceo || '',
    address: data.address || '',
    bizType: data.biz_type || '',
    bizItem: data.biz_item || '',
    email: data.email || '',
    tel: data.tel || '',
    contact: data.contact || '',
    bank_name: data.bank_name || '',
    bank_account: data.bank_account || '',
    bank_holder: data.bank_holder || '',
  };
}

export async function saveProfile(userId: string, profile: CompanyProfile): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      biz_no: profile.bizNo,
      name: profile.name,
      ceo: profile.ceo,
      address: profile.address,
      biz_type: profile.bizType,
      biz_item: profile.bizItem,
      email: profile.email,
      tel: profile.tel,
      contact: profile.contact,
      bank_name: profile.bank_name,
      bank_account: profile.bank_account,
      bank_holder: profile.bank_holder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}
