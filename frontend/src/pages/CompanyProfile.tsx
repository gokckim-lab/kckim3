import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchProfile, saveProfile, type CompanyProfile as CompanyProfileType } from '../lib/profile';
import { deleteAccount } from '../lib/backendApi';
import PartyForm from '../components/PartyForm';
import { emptyParty } from '../types';

export default function CompanyProfile() {
  const { user, signOut } = useAuth();
  const notify = useToast();
  const [profile, setProfile] = useState<CompanyProfileType>({ ...emptyParty(), bank_name: '', bank_account: '', bank_holder: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchProfile(user.id).then(setProfile).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveProfile(user.id, profile);
      notify('회사 정보를 저장했습니다.', 'success');
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!confirm('정말 탈퇴하시겠습니까? 탈퇴하면 견적서·주문서·거래명세서·세금계산서 등 모든 데이터가 삭제되며 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    try {
      await deleteAccount();
      notify('탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.', 'success');
      await signOut();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-400">불러오는 중...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">회사 정보 (공급자)</h1>
      <p className="text-sm text-slate-500">
        문서를 만들 때 공급자 정보로 자동 입력됩니다. 사업자등록증 PDF를 올려서 자동으로 채울 수 있습니다.
      </p>
      <PartyForm title="우리 회사" value={profile} onChange={(v) => setProfile({ ...profile, ...v })} />

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-3">입금 계좌 (거래명세서/견적서 표기용)</h3>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            은행
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={profile.bank_name}
              onChange={(e) => setProfile({ ...profile, bank_name: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            계좌번호
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={profile.bank_account}
              onChange={(e) => setProfile({ ...profile, bank_account: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            예금주
            <input className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" value={profile.bank_holder}
              onChange={(e) => setProfile({ ...profile, bank_holder: e.target.value })} />
          </label>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-slate-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
        {saving ? '저장 중...' : '저장'}
      </button>

      <div className="bg-white rounded-xl border border-rose-200 p-4 mt-8">
        <h3 className="font-semibold text-rose-700 mb-1">회원탈퇴</h3>
        <p className="text-xs text-slate-500 mb-3">
          남은 포인트가 있으면 탈퇴할 수 없습니다. 포인트 페이지에서 먼저 환불 신청을 하고 관리자 승인이 완료된 뒤 다시 시도해주세요.
          탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.
        </p>
        <button onClick={withdraw} disabled={deleting}
          className="border border-rose-300 text-rose-600 px-4 py-2 rounded-md text-sm hover:bg-rose-50 disabled:opacity-60">
          {deleting ? '처리 중...' : '회원탈퇴'}
        </button>
      </div>
    </div>
  );
}
