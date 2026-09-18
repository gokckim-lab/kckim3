import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

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

  const handleGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    // 성공하면 구글 로그인 화면으로 즉시 이동하므로 이 아래 코드는 실행되지 않는다.
    if (error) {
      setError(error);
      setGoogleBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
        <div className="order-2 md:order-1">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">🐦 Birdie Bill (버디빌)</h1>
          <p className="text-slate-600 mb-4">
            도소매업체를 위한 <b>견적서 · 주문서 · 거래명세서 · 전자세금계산서</b> 발행 웹 프로그램입니다.
            견적서를 주문서로, 주문서를 거래명세서로, 거래명세서를 세금계산서로 순서대로 변환할 수 있습니다.
          </p>
          <ul className="text-sm text-slate-500 space-y-1 mb-6 list-disc list-inside">
            <li>견적서 · 주문서 · 거래명세서 작성은 <b>무료</b></li>
            <li>전자세금계산서는 팝빌 연동으로 국세청에 <b>즉시 발행</b></li>
            <li>거래처 · 품목 관리, 카드/가상계좌로 포인트 충전</li>
            <li>문서가 이미 시스템에 있어 <b>발행 시간이 크게 단축</b>됩니다</li>
            <li>인증서를 한 번만 등록하면 되어, 발행할 때마다 <b>보안카드를 반복 제출할 필요가 없습니다</b></li>
          </ul>
          <details className="text-sm text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600">자주 묻는 질문</summary>
            <div className="mt-2 space-y-2">
              <p><b>Q. 견적서, 주문서, 거래명세서 작성도 유료인가요?</b><br />A. 아니요, 문서 작성과 변환은 모두 무료입니다. 세금계산서를 실제로 발행할 때만 건당 소액 포인트가 차감됩니다.</p>
              <p><b>Q. 세금계산서는 어떻게 발행되나요?</b><br />A. 거래명세서를 세금계산서로 변환 후 발행 버튼을 누르면 팝빌을 통해 국세청에 실시간 전자발행되고, 거래처에 이메일이 자동 발송됩니다.</p>
              <p><b>Q. 홈택스에서 직접 발행하는 것과 뭐가 다른가요?</b><br />A. 견적서 단계부터 입력한 데이터를 그대로 이어받아 발행하므로 매번 새로 입력할 필요가 없어 발행 시간이 단축됩니다. 또한 인증서를 팝빌에 한 번만 등록해두면 되어, 홈택스처럼 발행 건마다 보안카드를 반복 제출하지 않아도 됩니다.</p>
            </div>
          </details>
        </div>

      <form onSubmit={submit} className="order-1 md:order-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-1">로그인</h2>
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

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">또는</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button type="button" onClick={handleGoogle} disabled={googleBusy}
          className="w-full flex items-center justify-center gap-2 border border-slate-300 rounded-md py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 34.9 27 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.6 5.6C41.6 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          {googleBusy ? '이동 중...' : '구글 계정으로 계속하기'}
        </button>
      </form>
      </div>
    </div>
  );
}
