import { useRef, useState, type DragEvent } from 'react';
import { extractOrderDocument, type ExtractProgress, type OrderDocResult } from '../lib/orderDocExtract';
import { useToast } from '../context/ToastContext';

interface Props {
  label: string;
  onExtracted: (result: OrderDocResult) => void;
}

/** 견적서/주문서/거래명세서 PDF(또는 이미지)를 업로드해 거래처 정보 + 품목표를 한 번에 불러온다. */
export default function OrderDocUpload({ label, onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const notify = useToast();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setProgress({ running: true, percent: 0, status: '시작...' });
    try {
      const result = await extractOrderDocument(file, setProgress);
      const partyFields = Object.values(result.customer).filter((v) => v && String(v).trim()).length;
      if (result.items.length === 0 && partyFields === 0) {
        notify('문서에서 품목/거래처 정보를 찾지 못했습니다. 직접 입력해주세요.', 'warning');
      } else {
        onExtracted(result);
        notify(`${label} 불러오기 완료 (품목 ${result.items.length}건${partyFields ? `, 거래처 정보 ${partyFields}개 항목` : ''})`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      notify(`불러오기 중 오류가 발생했습니다: ${err.message ?? err}`, 'error');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex items-center gap-2 rounded-md ${dragOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.xlsx,.xls,.csv,.docx,.hwpx,.hwp,.doc"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!!progress?.running}
        className="text-xs px-3 py-1.5 rounded-md border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-60"
      >
        {progress?.running ? `${progress.status} (${progress.percent}%)` : dragOver ? '여기에 놓으세요' : `📎 ${label} 불러오기 (끌어다 놓기 가능)`}
      </button>
      {progress?.running && (
        <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      )}
    </div>
  );
}
