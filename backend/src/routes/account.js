const express = require('express');
const { requireAuth } = require('../requireAuth');
const { supabaseAdmin } = require('../supabaseAdmin');

const router = express.Router();

// 회원탈퇴: auth.users 삭제는 service_role 권한(admin API)이 있어야만 가능해서
// 클라이언트에서 직접 호출할 수 없다. 반드시 이 백엔드를 거치게 하고,
// 포인트 잔액이 남아있으면 먼저 환불 신청을 하도록 막는다(잔액을 임의로 없애지 않는다).
router.delete('/', requireAuth, async (req, res) => {
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('balance')
    .eq('owner_id', req.user.id)
    .single();

  const balance = Number(wallet?.balance ?? 0);
  if (balance > 0) {
    return res.status(400).json({
      error: `남은 포인트(${balance.toLocaleString('ko-KR')}P)가 있어 탈퇴할 수 없습니다. 포인트 페이지에서 환불 신청 후 관리자 승인이 완료되면 다시 시도해주세요.`,
    });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user.id);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했습니다.' });
  }

  // profiles/customers/products/documents/wallets/wallet_transactions 등은
  // 전부 auth.users(id) on delete cascade 로 걸려있어 자동으로 함께 삭제된다.
  res.json({ ok: true });
});

module.exports = router;
