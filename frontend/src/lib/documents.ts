import { supabase } from './supabaseClient';
import type { DocType, DocumentItem, DocumentRecord, PartyInfo } from '../types';

const PREFIX: Record<DocType, string> = {
  quote: 'QT',
  order: 'OD',
  delivery: 'DL',
  tax_invoice: 'TX',
};

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function calcItemAmounts(item: Pick<DocumentItem, 'qty' | 'unit_price'>, taxType: PartyInfo['taxType'] = '과세') {
  const supply = Math.round((item.qty || 0) * (item.unit_price || 0));
  const tax = taxType === '과세' ? Math.round(supply * 0.1) : 0;
  return { supply_price: supply, tax };
}

export function calcDocumentTotals(items: DocumentItem[]) {
  const supply_total = items.reduce((sum, it) => sum + (it.supply_price || 0), 0);
  const tax_total = items.reduce((sum, it) => sum + (it.tax || 0), 0);
  return { supply_total, tax_total, grand_total: supply_total + tax_total };
}

/** 같은 타입 문서 중 오늘 만든 개수를 세어 순번을 매긴다 (충돌 시 재시도) */
async function generateDocNo(ownerId: string, type: DocType): Promise<string> {
  const stamp = todayStamp();
  const base = `${PREFIX[type]}-${stamp}`;
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .like('doc_no', `${base}%`);
  const seq = (count ?? 0) + 1;
  return `${base}-${String(seq).padStart(3, '0')}`;
}

export interface DocumentDraft {
  type: DocType;
  customer_id: string | null;
  supplier: PartyInfo;
  customer: PartyInfo;
  issue_date: string;
  due_date: string | null;
  memo: string;
  items: DocumentItem[];
  source_document_id?: string | null;
}

export async function createDocument(ownerId: string, userId: string, draft: DocumentDraft): Promise<DocumentRecord> {
  const totals = calcDocumentTotals(draft.items);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const doc_no = await generateDocNo(ownerId, draft.type);
    const { data, error } = await supabase
      .from('documents')
      .insert({
        owner_id: ownerId,
        created_by: userId,
        type: draft.type,
        doc_no,
        customer_id: draft.customer_id,
        supplier: draft.supplier,
        customer: draft.customer,
        issue_date: draft.issue_date,
        due_date: draft.due_date,
        memo: draft.memo,
        source_document_id: draft.source_document_id ?? null,
        ...totals,
      })
      .select()
      .single();

    if (!error && data) {
      const items = draft.items.map((it, idx) => ({ ...it, document_id: data.id, sort_order: idx }));
      if (items.length > 0) {
        const { error: itemErr } = await supabase.from('document_items').insert(items);
        if (itemErr) throw itemErr;
      }
      return { ...data, document_items: draft.items } as DocumentRecord;
    }

    lastErr = error;
    // 23505 = unique_violation (doc_no 충돌) -> 재시도, 그 외 에러는 즉시 던진다
    if (!error || (error as any).code !== '23505') throw error;
  }
  throw lastErr;
}

export async function updateDocument(id: string, draft: DocumentDraft): Promise<void> {
  const totals = calcDocumentTotals(draft.items);
  const { error } = await supabase
    .from('documents')
    .update({
      customer_id: draft.customer_id,
      supplier: draft.supplier,
      customer: draft.customer,
      issue_date: draft.issue_date,
      due_date: draft.due_date,
      memo: draft.memo,
      updated_at: new Date().toISOString(),
      ...totals,
    })
    .eq('id', id);
  if (error) throw error;

  const { error: delErr } = await supabase.from('document_items').delete().eq('document_id', id);
  if (delErr) throw delErr;

  if (draft.items.length > 0) {
    const items = draft.items.map((it, idx) => ({ ...it, document_id: id, sort_order: idx }));
    const { error: insErr } = await supabase.from('document_items').insert(items);
    if (insErr) throw insErr;
  }
}

export async function fetchDocuments(type?: DocType): Promise<DocumentRecord[]> {
  let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentRecord[];
}

export async function fetchDocument(id: string): Promise<DocumentRecord> {
  const { data, error } = await supabase
    .from('documents')
    .select('*, document_items(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const doc = data as any;
  doc.document_items = (doc.document_items ?? []).sort((a: DocumentItem, b: DocumentItem) => a.sort_order - b.sort_order);
  return doc as DocumentRecord;
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}

export const NEXT_TYPE: Record<DocType, DocType | null> = {
  quote: 'order',
  order: 'delivery',
  delivery: 'tax_invoice',
  tax_invoice: null,
};
