import type { DocumentRecord } from '../types';
import { DOC_TYPE_LABEL } from '../types';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

export default function PrintableDocument({ doc }: { doc: DocumentRecord }) {
  const items = doc.document_items ?? [];

  return (
    <div className="printable bg-white text-slate-900 p-10 max-w-[210mm] mx-auto border border-slate-200 print:border-0">
      <div className="flex items-center justify-between border-b-4 border-slate-800 pb-4 mb-6">
        <h1 className="text-3xl font-bold tracking-wide">{DOC_TYPE_LABEL[doc.type]}</h1>
        <div className="text-right text-sm text-slate-500">
          <div>문서번호: {doc.doc_no}</div>
          <div>작성일: {doc.issue_date}</div>
          {doc.due_date && <div>납기일: {doc.due_date}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
        <PartyBlock title="공급받는자" party={doc.customer} />
        <PartyBlock title="공급자" party={doc.supplier} />
      </div>

      <table className="w-full text-sm border-t-2 border-slate-800 mb-4">
        <thead>
          <tr className="border-b border-slate-300 text-slate-600">
            <th className="py-2 text-left">품목</th>
            <th className="py-2 text-left">규격</th>
            <th className="py-2 text-right">수량</th>
            <th className="py-2 text-right">단가</th>
            <th className="py-2 text-right">공급가액</th>
            <th className="py-2 text-right">세액</th>
            <th className="py-2 text-left">비고</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              <td className="py-1.5">{it.name}</td>
              <td className="py-1.5">{it.spec}</td>
              <td className="py-1.5 text-right">{it.qty}</td>
              <td className="py-1.5 text-right">{it.unit_price.toLocaleString('ko-KR')}</td>
              <td className="py-1.5 text-right">{it.supply_price.toLocaleString('ko-KR')}</td>
              <td className="py-1.5 text-right">{it.tax.toLocaleString('ko-KR')}</td>
              <td className="py-1.5">{it.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <table className="text-sm w-64">
          <tbody>
            <tr><td className="py-1 text-slate-500">공급가액 합계</td><td className="py-1 text-right font-medium">{won(doc.supply_total)}</td></tr>
            <tr><td className="py-1 text-slate-500">세액 합계</td><td className="py-1 text-right font-medium">{won(doc.tax_total)}</td></tr>
            <tr className="border-t border-slate-300"><td className="py-1.5 font-semibold">총 합계</td><td className="py-1.5 text-right font-bold text-lg">{won(doc.grand_total)}</td></tr>
          </tbody>
        </table>
      </div>

      {doc.memo && (
        <div className="mt-6 text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-200 pt-3">
          <span className="font-medium text-slate-700">비고: </span>{doc.memo}
        </div>
      )}

      {doc.type === 'tax_invoice' && (
        <div className="mt-4 text-xs text-slate-400">
          {doc.popbill_status === 'ISSUED'
            ? `국세청 승인번호: ${doc.popbill_nts_confirm_num ?? '-'} · 발행일시: ${doc.popbill_issued_at ? new Date(doc.popbill_issued_at).toLocaleString('ko-KR') : '-'}`
            : '※ 팝빌을 통해 발행되지 않은 임시 미리보기입니다.'}
        </div>
      )}
    </div>
  );
}

function PartyBlock({ title, party }: { title: string; party: DocumentRecord['supplier'] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-slate-400 mb-1">{title}</div>
      <div className="font-semibold text-base">{party.name || '-'}</div>
      <div className="text-slate-500 text-xs mt-1 space-y-0.5">
        <div>등록번호 {party.bizNo || '-'}</div>
        <div>대표자 {party.ceo || '-'}</div>
        <div>{party.address || '-'}</div>
        <div>{[party.bizType, party.bizItem].filter(Boolean).join(' / ') || '-'}</div>
      </div>
    </div>
  );
}
