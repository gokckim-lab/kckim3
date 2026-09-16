import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const action = mode === 'signin' ? signIn : signUp;
    const { error } = await action(email, password);
    setBusy(false);
    if (error) setError(error);
    else if (mode === 'signup') setInfo('가입 완료! 이메일 인증이 필요할 수 있습니다. 로그인해주세요.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">🐦 Birdie Bill</h1>
        <p className="text-sm text-slate-500 mb-6">견적 · 주문 · 거래명세서 · 세금계산서</p>

        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-3">
          이메일
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1 mb-4">
          비밀번호
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </label>

        {error && <div className="text-sm text-rose-600 mb-3">{error}</div>}
        {info && <div className="text-sm text-emerald-600 mb-3">{info}</div>}

        <button type="submit" disabled={busy}
          className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
          {mode === 'signin' ? '로그인' : '회원가입'}
        </button>

        <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-xs text-slate-500 mt-3 hover:underline">
          {mode === 'signin' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </form>
    </div>
  );
}
