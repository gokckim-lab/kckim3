import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STEPS = ['견적서', '주문서', '거래명세서', '전자세금계산서'];

const FEATURES = [
  { title: '한 번 입력하면 끝까지 이어집니다', body: '견적서에 입력한 거래처·품목이 주문서, 거래명세서, 세금계산서까지 그대로 넘어갑니다. 같은 내용을 다시 칠 필요가 없습니다.' },
  { title: '세금계산서는 국세청에 즉시 발행', body: '팝빌 연동으로 발행 버튼 한 번에 전자발행되고, 거래처에 이메일도 자동으로 발송됩니다.' },
  { title: '보안카드 반복 제출 없음', body: '인증서를 한 번만 등록해 두면, 홈택스처럼 발행할 때마다 보안카드를 꺼낼 필요가 없습니다.' },
  { title: '사업자등록증만 올리면 자동 입력', body: '사업자등록증 사진이나 PDF를 올리면 상호·대표자·주소 등을 읽어서 채워 줍니다.' },
];

const FAQ = [
  { q: '견적서, 주문서, 거래명세서 작성도 유료인가요?', a: '아니요, 문서 작성과 변환은 모두 무료입니다. 세금계산서를 실제로 발행할 때만 건당 소액 포인트가 차감됩니다.' },
  { q: '가입하려면 무엇이 필요한가요?', a: '이메일과 비밀번호만 있으면 바로 가입됩니다. 구글 계정으로도 가입할 수 있고, 가입 없이 먼저 써볼 수도 있습니다.' },
  { q: '홈택스에서 직접 발행하는 것과 뭐가 다른가요?', a: '견적서 단계부터 입력한 데이터를 그대로 이어받아 발행하므로 발행 시간이 크게 단축되고, 인증서를 한 번만 등록하면 됩니다.' },
];

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/documents/quote" replace />;

  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-14 sm:py-20 text-center">
          <p className="text-sm text-violet-300 font-medium mb-3">도소매업체를 위한 견적·주문·세금계산서 프로그램</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
            견적서부터 세금계산서까지,<br />한 화면에서 끝냅니다
          </h1>
          <p className="text-slate-300 mb-8">
            견적서 · 주문서 · 거래명세서 작성은 <b className="text-white">무료</b>, 전자세금계산서는 국세청에 <b className="text-white">즉시 발행</b>합니다.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/documents/quote" className="bg-white text-slate-900 font-medium px-6 py-3 rounded-lg hover:bg-slate-100">
              가입 없이 무료로 써보기
            </Link>
            <Link to="/login?mode=signup" className="border border-slate-500 text-white font-medium px-6 py-3 rounded-lg hover:bg-slate-800">
              회원가입
            </Link>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            이미 계정이 있으신가요? <Link to="/login" className="underline text-slate-200">로그인</Link>
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-700">
          {STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="bg-white border border-slate-200 rounded-full px-4 py-1.5">{s}</span>
              {i < STEPS.length - 1 && <span className="text-slate-400">→</span>}
            </span>
          ))}
        </div>
        <p className="text-center text-sm text-slate-500 mt-3">순서대로 버튼 한 번으로 변환됩니다.</p>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-10 grid sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-bold text-slate-800 mb-1.5">{f.title}</h2>
            <p className="text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-10">
        <h2 className="text-lg font-bold text-slate-800 mb-3">자주 묻는 질문</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="font-medium text-slate-800 mb-1">Q. {f.q}</p>
              <p className="text-sm text-slate-600">A. {f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 pb-14 text-center">
        <Link to="/login?mode=signup" className="inline-block bg-slate-900 text-white font-medium px-8 py-3 rounded-lg hover:bg-slate-800">
          지금 무료로 시작하기
        </Link>
      </section>
    </div>
  );
}
