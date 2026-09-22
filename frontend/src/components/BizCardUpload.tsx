import { useRef, useState, type DragEvent } from 'react';
import { extractBusinessCard, type ExtractProgress } from '../lib/bizCardExtract';
import type { PartyInfo } from '../types';
import { useToast } from '../context/ToastContext';

interface Props {
  label: string;
  onExtracted: (fields: Partial<PartyInfo>) => void;
}

export default function BizCardUpload({ label, onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const notify = useToast();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setProgress({ running: true, percent: 0, status: '시작...' });
    try {
      const fields = await extractBusinessCard(file, setProgress);
      const filledCount = Object.values(fields).filter((v) => v && String(v).trim()).length;
      if (filledCount === 0) {
        notify('자동 인식된 항목이 없습니다. 아래 항목을 직접 입력해주세요.', 'warning');
      } else {
        onExtracted(fields);
        notify(
          filledCount >= 4 ? `${label} 정보 자동 인식 완료 (${filledCount}개 항목)` : `일부 항목만 인식되었습니다 (${filledCount}개). 나머지는 직접 입력해주세요.`,
          filledCount >= 4 ? 'success' : 'warning'
        );
      }
    } catch (err: any) {
      console.error(err);
      notify(`인식 중 오류가 발생했습니다: ${err.message ?? err}`, 'error');
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
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!!progress?.running}
        className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60"
      >
        {progress?.running ? `${progress.status} (${progress.percent}%)` : dragOver ? '여기에 놓으세요' : `📄 ${label} 사업자등록증 업로드 (끌어다 놓기 가능)`}
      </button>
      {progress?.running && (
        <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      )}
    </div>
  );
}
