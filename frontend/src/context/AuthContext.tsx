import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

// Supabase가 영어 원문 그대로 주는 에러 메시지를 한국어로 바꾼다.
// 알려진 문구가 아니면 원문을 그대로 보여준다(새로 추가된 Supabase 에러를 숨기지 않기 위해).
const AUTH_ERROR_KO: Record<string, string> = {
  'Email not confirmed': '이메일 인증이 완료되지 않았습니다. 가입하신 이메일의 인증 메일을 확인해주세요.',
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'User already registered': '이미 가입된 이메일입니다. 로그인해주세요.',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다.',
  'Signup requires a valid password': '올바른 비밀번호를 입력해주세요.',
  'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않습니다.',
  'Email rate limit exceeded': '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
  'For security purposes, you can only request this after some time.': '보안을 위해 잠시 후 다시 시도해주세요.',
};
const translateAuthError = (message?: string | null) => (message ? (AUTH_ERROR_KO[message] ?? message) : null);

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setIsAdmin(false); return; }
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', uid).single();
        setIsAdmin(!!data?.is_admin);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: translateAuthError(error?.message) };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: translateAuthError(error?.message) };
  };

  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: translateAuthError(error?.message) };
  };

  const signInWithGoogle = async () => {
    // OAuth는 구글 로그인 화면으로 이동했다가 돌아오는 리다이렉트 방식이라, 여기서 에러가 나면
    // 대부분 "redirect_uri_mismatch"처럼 설정 문제다. 로그인 자체의 성공/실패는 리다이렉트 후
    // onAuthStateChange로 알 수 있으므로 여기서는 리다이렉트 시작 실패만 처리한다.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error: translateAuthError(error?.message) };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, isAdmin, signIn, signUp, signInWithGoogle, resendConfirmation, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
