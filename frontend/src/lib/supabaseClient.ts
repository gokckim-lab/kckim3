import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. frontend/.env 파일을 확인하세요.'
  );
}

// 환경변수가 비어 있어도 앱이 죽지 않도록 형식만 유효한 더미 값으로 대체한다.
// (실제 Supabase 요청은 당연히 실패하며, 위 경고로 원인을 바로 알 수 있다)
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'public-anon-key-placeholder');
