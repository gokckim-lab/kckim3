import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { findEmailByBizNo, requestPasswordReset, type FoundAccount } from '../lib/backendApi';

export default function AccountRecovery() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'email' | 'password'>(params.get('tab') === 'password' ? 'password' : 'email');

  return (
    <div className="min-h-[70vh] flex items-start justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="grid grid-cols-2 mb-6 border-b border-slate-200 text-sm">
          {([['email', '아이디(이메일) 찾기'], ['password', '비밀번호 찾기']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`pb-2 -mb-px border-b-2 ${tab === k ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'email' ? <FindEmail onGoReset={() => setTab('password')} /> : <ResetRequest />}
        <Link to="/login" className="block text-center text-xs text-slate-500 mt-6 hover:underline">← 로그인 화면으로</Link>
      </div>
    </div>
  );
}

function FindEmail({ onGoReset }: { onGoReset: () => void }) {
  const [bizNo, setBizNo] = useState('');
  const [result, setResult] = useState<FoundAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await findEmailByBizNo(bizNo));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="text-xs text-slate-500 mb-4">버디빌은 가입한 <b>이메일이 아이디</b>입니다. 회사정보에 등록한 사업자등록번호로 가입 이메일을 찾을 수 있습니다.</p>
      <label className="text-xs text-slate-500 flex flex-col gap-1 mb-4">
        사업자등록번호
        <input required value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="123-45-67890"
          className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </label>
      {error && <div className="text-sm text-rose-600 mb-3">{error}</div>}
      {result && result.length === 0 && (
        <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3 mb-3">
          이 사업자등록번호로 등록된 계정이 없습니다. 회사정보를 입력하지 않고 가입하셨다면 찾을 수 없으니 문의(gokckim@gmail.com)해주세요.
        </div>
      )}
      {result && result.length > 0 && (
        <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-md p-3 mb-3 space-y-1">
          <div className="text-emerald-800 font-medium">가입된 이메일</div>
          {result.map((a) => (
            <div key={a.email + a.createdAt} className="text-slate-700">
              {a.email} {a.google && <span className="text-xs text-slate-500">(구글 로그인)</span>}
              <span className="text-xs text-slate-400 ml-1">· {a.createdAt.slice(0, 10)} 가입</span>
            </div>
          ))}
          <button type="button" onClick={onGoReset} className="text-xs text-blue-600 hover:underline pt-1">비밀번호도 잊으셨나요? →</button>
        </div>
      )}
      <button type="submit" disabled={busy}
        className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
        {busy ? '조회 중...' : '이메일 찾기'}
      </button>
    </form>
  );
}

function ResetRequest() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-sm text-slate-600 bg-emerald-50 border border-emerald-200 rounded-md p-4 space-y-2">
        <p><b>{email}</b>(으)로 가입되어 있다면 비밀번호 재설정 메일을 보냈습니다.</p>
        <p className="text-xs text-slate-500">메일이 보이지 않으면 스팸함을 확인해주세요. 링크는 1시간 동안 유효합니다. 구글로 가입한 계정이면 구글 로그인 안내 메일이 갑니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="text-xs text-slate-500 mb-4">가입한 이메일을 입력하면 새 비밀번호를 설정할 수 있는 링크를 보내드립니다.</p>
      <label className="text-xs text-slate-500 flex flex-col gap-1 mb-4">
        가입한 이메일
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </label>
      {error && <div className="text-sm text-rose-600 mb-3">{error}</div>}
      <button type="submit" disabled={busy}
        className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
        {busy ? '보내는 중...' : '재설정 메일 받기'}
      </button>
    </form>
  );
}
