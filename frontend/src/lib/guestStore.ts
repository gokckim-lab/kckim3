// 가입 없이 체험할 때 쓰는 브라우저(localStorage) 저장소. 서버에는 아무것도 보내지 않는다.
import type { DocType, DocumentItem, DocumentRecord, PartyInfo } from '../types';
import { emptyParty } from '../types';
import type { DocumentDraft } from './documents';
import { calcDocumentTotals } from './documents';

const DOCS_KEY = 'bb_guest_docs_v1';
const SUPPLIER_KEY = 'bb_guest_supplier_v1';
const MAX_DOCS = 200;

const PREFIX: Record<DocType, string> = { quote: 'QT', order: 'OD', delivery: 'DL', tax_invoice: 'TX' };

function readDocs(): DocumentRecord[] {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    return raw ? (JSON.parse(raw) as DocumentRecord[]) : [];
  } catch {
    return [];
  }
}

function writeDocs(docs: DocumentRecord[]) {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  } catch {
    throw new Error('브라우저 저장 공간이 부족하거나 사용할 수 없습니다. 가입하면 서버에 안전하게 저장할 수 있습니다.');
  }
}

function newId(): string {
  return `g-${crypto.randomUUID()}`;
}

export const isGuestId = (id: string) => id.startsWith('g-');

function nextDocNo(docs: DocumentRecord[], type: DocType): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${PREFIX[type]}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const seq = docs.filter((x) => x.doc_no.startsWith(base)).length + 1;
  return `${base}-${String(seq).padStart(3, '0')}`;
}

const withItems = (items: DocumentItem[]) => items.map((it, idx) => ({ ...it, sort_order: idx }));

export function listGuestDocs(type?: DocType): DocumentRecord[] {
  const docs = readDocs().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return type ? docs.filter((d) => d.type === type) : docs;
}

export function listGuestDocsOldestFirst(): DocumentRecord[] {
  return readDocs().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getGuestDoc(id: string): DocumentRecord {
  const doc = readDocs().find((d) => d.id === id);
  if (!doc) throw new Error('문서를 찾을 수 없습니다. (이 브라우저에 저장된 문서만 볼 수 있습니다)');
  return doc;
}

export function createGuestDoc(draft: DocumentDraft): DocumentRecord {
  const docs = readDocs();
  if (docs.length >= MAX_DOCS) throw new Error(`체험 모드에서는 문서를 ${MAX_DOCS}건까지 저장할 수 있습니다. 가입하면 제한 없이 저장됩니다.`);
  const now = new Date().toISOString();
  const record: DocumentRecord = {
    id: newId(),
    owner_id: 'guest',
    type: draft.type,
    doc_no: nextDocNo(docs, draft.type),
    status: 'draft',
    customer_id: null,
    supplier: draft.supplier,
    customer: draft.customer,
    issue_date: draft.issue_date,
    due_date: draft.due_date,
    memo: draft.memo,
    source_document_id: draft.source_document_id ?? null,
    popbill_status: 'NONE',
    popbill_mgt_key: null,
    popbill_nts_confirm_num: null,
    popbill_issued_at: null,
    popbill_last_error: null,
    created_by: 'guest',
    created_at: now,
    updated_at: now,
    document_items: withItems(draft.items),
    ...calcDocumentTotals(draft.items),
  };
  writeDocs([...docs, record]);
  return record;
}

export function updateGuestDoc(id: string, draft: DocumentDraft): void {
  const docs = readDocs();
  const idx = docs.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('문서를 찾을 수 없습니다.');
  docs[idx] = {
    ...docs[idx],
    supplier: draft.supplier,
    customer: draft.customer,
    issue_date: draft.issue_date,
    due_date: draft.due_date,
    memo: draft.memo,
    updated_at: new Date().toISOString(),
    document_items: withItems(draft.items),
    ...calcDocumentTotals(draft.items),
  };
  writeDocs(docs);
}

export function deleteGuestDoc(id: string): void {
  writeDocs(readDocs().filter((d) => d.id !== id));
}

export function loadGuestSupplier(): PartyInfo {
  try {
    const raw = localStorage.getItem(SUPPLIER_KEY);
    return raw ? { ...emptyParty(), ...(JSON.parse(raw) as PartyInfo) } : emptyParty();
  } catch {
    return emptyParty();
  }
}

export function saveGuestSupplier(supplier: PartyInfo): void {
  try {
    localStorage.setItem(SUPPLIER_KEY, JSON.stringify(supplier));
  } catch {
    /* 공급자 정보 기억은 편의 기능이므로 실패해도 무시 */
  }
}

export function hasGuestData(): boolean {
  return readDocs().length > 0;
}

export function clearGuestData(): void {
  try {
    localStorage.removeItem(DOCS_KEY);
    localStorage.removeItem(SUPPLIER_KEY);
  } catch {
    /* ignore */
  }
}
