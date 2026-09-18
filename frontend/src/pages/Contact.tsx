import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { sendContactMessage } from '../lib/backendApi';

export default function Contact() {
  const notify = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) return notify('문의 내용을 입력해주세요.', 'warning');
    setSending(true);
    try {
      await sendContactMessage(subject, message);
      notify('문의가 접수되었습니다. 빠르게 답변드리겠습니다.', 'success');
      setSubject('');
      setMessage('');
      setSent(true);
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">문의하기</h1>
      <p className="text-sm text-slate-500">
        사용 중 불편한 점이나 궁금한 점을 남겨주시면 확인 후 답변드립니다.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          제목 (선택)
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="예: 세금계산서 발행 오류 문의"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          문의 내용
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={8} placeholder="불편했던 점이나 문의사항을 자세히 적어주세요."
            className="border border-slate-300 rounded-md px-3 py-2 text-sm resize-none" />
        </label>
        <button onClick={submit} disabled={sending}
          className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm hover:bg-slate-800 disabled:opacity-60">
          {sending ? '전송 중...' : '문의 보내기'}
        </button>
        {sent && <p className="text-xs text-emerald-600">문의가 정상적으로 전송되었습니다.</p>}
      </div>
    </div>
  );
}
