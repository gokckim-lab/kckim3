import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const OPERATOR = {
  service: 'Birdie Bill(버디빌)',
  company: '버디(Birdie)',
  ceo: '김기천',
  bizNo: '215-21-35106',
  address: '서울특별시 송파구 충민로 10, C동 1층 8호(문정동, 가든파이브툴관 1층)',
  email: 'gokckim@gmail.com',
  site: 'https://birdiebill.co.kr',
};

export const LEGAL_EFFECTIVE_DATE = '2026년 9월 21일';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to="/" className="text-sm text-slate-500 hover:underline">← 서비스로 돌아가기</Link>
      <h1 className="text-2xl font-bold text-slate-800 mt-3 mb-1">{title}</h1>
      <p className="text-xs text-slate-400 mb-6">시행일: {LEGAL_EFFECTIVE_DATE}</p>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 text-sm text-slate-700 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
