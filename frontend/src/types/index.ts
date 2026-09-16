export type DocType = 'quote' | 'order' | 'delivery' | 'tax_invoice';

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  quote: '견적서',
  order: '주문서',
  delivery: '거래명세서',
  tax_invoice: '세금계산서',
};

export const DOC_TYPE_ORDER: DocType[] = ['quote', 'order', 'delivery', 'tax_invoice'];

export interface PartyInfo {
  bizNo: string;
  name: string;
  ceo: string;
  address: string;
  bizType: string;
  bizItem: string;
  email: string;
  tel: string;
  contact: string;
  purposeType?: '영수' | '청구';
  taxType?: '과세' | '면세' | '영세';
}

export const emptyParty = (): PartyInfo => ({
  bizNo: '', name: '', ceo: '', address: '', bizType: '', bizItem: '',
  email: '', tel: '', contact: '', purposeType: '영수', taxType: '과세',
});

export interface DocumentItem {
  id?: string;
  document_id?: string;
  sort_order: number;
  name: string;
  spec: string;
  qty: number;
  unit_price: number;
  supply_price: number;
  tax: number;
  remark: string;
}

export const emptyItem = (order = 0): DocumentItem => ({
  sort_order: order, name: '', spec: '', qty: 1, unit_price: 0, supply_price: 0, tax: 0, remark: '',
});

export type PopbillStatus = 'NONE' | 'ISSUED' | 'FAILED';

export interface DocumentRecord {
  id: string;
  owner_id: string;
  type: DocType;
  doc_no: string;
  status: 'draft' | 'confirmed' | 'canceled';
  customer_id: string | null;
  supplier: PartyInfo;
  customer: PartyInfo;
  issue_date: string;
  due_date: string | null;
  memo: string;
  supply_total: number;
  tax_total: number;
  grand_total: number;
  source_document_id: string | null;
  popbill_status: PopbillStatus;
  popbill_mgt_key: string | null;
  popbill_nts_confirm_num: string | null;
  popbill_issued_at: string | null;
  popbill_last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  document_items?: DocumentItem[];
}

export interface CustomerRecord {
  id: string;
  owner_id: string;
  biz_no: string;
  name: string;
  ceo: string;
  address: string;
  biz_type: string;
  biz_item: string;
  email: string;
  tel: string;
  contact: string;
  memo: string;
  created_at: string;
}

export interface ProductRecord {
  id: string;
  owner_id: string;
  name: string;
  spec: string;
  unit: string;
  unit_price: number;
  memo: string;
  created_at: string;
}
