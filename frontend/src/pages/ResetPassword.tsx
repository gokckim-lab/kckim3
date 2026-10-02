import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

// 재설정 링크 확인은 앱의 로그인 세션과 분리된 클라이언트로 한다. 같은 클라이언트를 쓰면 확인 순간
// 로그인 상태로 바뀌면서 화면 전체가 다시 그려져 입력 중인 폼이 사라진다.
const recoveryClient = () =>
  createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bb-recovery' },
  });

export default function ResetPassword() {
  const [params] = useSearchParams();
  const tokenHash = params.get('token_hash');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (password !== confirm) return setError('두 비밀번호가 서로 다릅니다.');
    setBusy(true);
    setError(null);
    const client = recoveryClient();
    const { error: verifyErr } = await client.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });
    if (verifyErr) {
      setBusy(false);
      return setError('링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기에서 메일을 다시 받아주세요.');
    }
    const { error: updateErr } = await client.auth.updateUser({ password });
    await client.auth.signOut({ scope: 'local' });
    setBusy(false);
    if (updateErr) return setError(updateErr.message);
    setDone(true);
  };

  return (
    <div className="min-h-[70vh] flex items-start justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">새 비밀번호 설정</h2>
        {!tokenHash ? (
          <p className="text-sm text-slate-600">
            재설정 링크가 올바르지 않습니다. <Link to="/find-account?tab=password" className="text-blue-600 underline">비밀번호 찾기</Link>에서 메일을 다시 받아주세요.
          </p>
        ) : done ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.</p>
            <Link to="/login" className="block text-center bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800">로그인하기</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="text-xs text-slate-500 flex flex-col gap-1 mb-3">
              새 비밀번호 (6자 이상)
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1 mb-4">
              새 비밀번호 확인
              <input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </label>
            {error && (
              <div className="text-sm text-rose-600 mb-3">
                {error}{' '}
                {error.includes('만료') && <Link to="/find-account?tab=password" className="underline">다시 받기</Link>}
              </div>
            )}
            <button type="submit" disabled={busy}
              className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
              {busy ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
