// 로그인 여부에 따라 서버(Supabase) 또는 브라우저(체험 모드)에 문서를 저장하는 공통 창구.
import type { DocType, DocumentRecord } from '../types';
import {
  createDocument, deleteDocument, fetchDocument, fetchDocuments, updateDocument, type DocumentDraft,
} from './documents';
import {
  clearGuestData, createGuestDoc, deleteGuestDoc, getGuestDoc, listGuestDocs, listGuestDocsOldestFirst,
  loadGuestSupplier, updateGuestDoc,
} from './guestStore';
import { fetchProfile, saveProfile } from './profile';

export interface DocStore {
  list(type?: DocType): Promise<DocumentRecord[]>;
  get(id: string): Promise<DocumentRecord>;
  create(draft: DocumentDraft): Promise<DocumentRecord>;
  update(id: string, draft: DocumentDraft): Promise<void>;
  remove(id: string): Promise<void>;
}

const guestStore: DocStore = {
  list: async (type) => listGuestDocs(type),
  get: async (id) => getGuestDoc(id),
  create: async (draft) => createGuestDoc(draft),
  update: async (id, draft) => updateGuestDoc(id, draft),
  remove: async (id) => deleteGuestDoc(id),
};

export function getDocStore(userId: string | null): DocStore {
  if (!userId) return guestStore;
  return {
    list: (type) => fetchDocuments(type),
    get: (id) => fetchDocument(id),
    create: (draft) => createDocument(userId, userId, draft),
    update: (id, draft) => updateDocument(id, draft),
    remove: (id) => deleteDocument(id),
  };
}

let migrating: Promise<number> | null = null;

/** 체험 모드로 작성해둔 문서를 방금 로그인한 계정으로 옮기고 브라우저 쪽 기록은 지운다. 옮긴 문서 수를 반환. */
export function migrateGuestData(userId: string): Promise<number> {
  if (migrating) return migrating;
  migrating = (async () => {
    const docs = listGuestDocsOldestFirst();
    if (docs.length === 0) return 0;

    const idMap = new Map<string, string>();
    for (const g of docs) {
      const created = await createDocument(userId, userId, {
        type: g.type,
        customer_id: null,
        supplier: g.supplier,
        customer: g.customer,
        issue_date: g.issue_date,
        due_date: g.due_date,
        memo: g.memo,
        items: (g.document_items ?? []).map(({ id: _id, document_id: _docId, ...rest }) => rest),
        source_document_id: g.source_document_id ? idMap.get(g.source_document_id) ?? null : null,
      });
      idMap.set(g.id, created.id);
    }

    // 계정에 아직 회사 정보가 비어 있으면, 체험 때 입력한 공급자 정보를 채워준다.
    try {
      const profile = await fetchProfile(userId);
      const guestSupplier = loadGuestSupplier();
      if (!profile.name.trim() && guestSupplier.name.trim()) {
        await saveProfile(userId, {
          ...profile,
          bizNo: guestSupplier.bizNo, name: guestSupplier.name, ceo: guestSupplier.ceo,
          address: guestSupplier.address, bizType: guestSupplier.bizType, bizItem: guestSupplier.bizItem,
          email: guestSupplier.email, tel: guestSupplier.tel, contact: guestSupplier.contact,
        });
      }
    } catch {
      /* 회사 정보 이전은 부가 기능이므로 실패해도 문서 이전 결과에는 영향 없음 */
    }

    clearGuestData();
    return docs.length;
  })().finally(() => { migrating = null; });
  return migrating;
}
