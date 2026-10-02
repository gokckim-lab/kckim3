const express = require('express');
const { requireAuth } = require('../requireAuth');
const { supabaseAdmin } = require('../supabaseAdmin');
const { sendMail, escapeHtml } = require('../mailer');

const router = express.Router();
const APP_URL = process.env.APP_URL || 'https://birdiebill.co.kr';
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// 로그인 없이 호출되는 계정찾기 API를 무차별 대입에 쓰지 못하게 IP당 횟수를 제한한다.
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    // 맨 앞 값은 클라이언트가 임의로 넣을 수 있으므로, 프록시(Railway)가 마지막에 붙인 값을 쓴다.
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();
    const key = `${req.path}|${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

// admin listUsers 응답에는 identities가 빠져 있어서 app_metadata.providers로 판단한다.
const hasPasswordLogin = (u) => (u.app_metadata?.providers || [u.app_metadata?.provider]).includes('email');

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}${'*'.repeat(Math.max(3, local.length - keep))}@${domain}`;
}

const mailHtml = (title, bodyHtml) => `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>${bodyHtml}
<p style="font-size:12px;color:#94a3b8;margin-top:24px">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 버디빌(birdiebill.co.kr)</p></div>`;

// 비밀번호 재설정 메일. 가입 여부가 드러나지 않도록 화면 응답은 항상 같고, 실제 내용은 메일로만 보낸다.
router.post('/password-reset', rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '이메일 주소를 정확히 입력해주세요.' });

  try {
    const user = (await listAllUsers()).find((u) => (u.email || '').toLowerCase() === email);
    if (user && hasPasswordLogin(user)) {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email: user.email });
      if (error) throw error;
      const link = `${APP_URL}/reset-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
      await sendMail({
        to: user.email,
        subject: '[버디빌] 비밀번호 재설정 안내',
        html: mailHtml('비밀번호 재설정', `<p>아래 버튼을 눌러 새 비밀번호를 설정해주세요. 링크는 1시간 동안 한 번만 사용할 수 있습니다.</p>
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">새 비밀번호 설정하기</a></p>`),
        text: `아래 링크에서 새 비밀번호를 설정해주세요. (1시간 동안 한 번만 사용 가능)\n${link}`,
      });
    } else if (user) {
      await sendMail({
        to: user.email,
        subject: '[버디빌] 구글 계정으로 가입된 이메일입니다',
        html: mailHtml('구글 계정으로 가입되어 있습니다', `<p>이 이메일은 구글 계정으로 가입되어 있어 별도의 비밀번호가 없습니다.</p>
<p>로그인 화면에서 <b>[구글 계정으로 계속하기]</b>를 눌러 로그인해주세요.</p>
<p style="margin:24px 0"><a href="${APP_URL}/login" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">버디빌 로그인</a></p>`),
        text: `이 이메일은 구글 계정으로 가입되어 있어 비밀번호가 없습니다. 로그인 화면에서 [구글 계정으로 계속하기]를 눌러주세요.\n${APP_URL}/login`,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[password-reset]', err.message);
    res.status(500).json({ error: '메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

// 아이디(이메일) 찾기: 회사정보에 등록된 사업자등록번호로 가입 이메일을 일부 가려서 보여준다.
router.post('/find-email', rateLimit(10, 10 * 60 * 1000), async (req, res) => {
  const bizNo = onlyDigits(req.body?.bizNo);
  if (bizNo.length !== 10) return res.status(400).json({ error: '사업자등록번호 10자리를 입력해주세요.' });

  try {
    const { data: profiles, error } = await supabaseAdmin.from('profiles').select('id, biz_no');
    if (error) throw error;
    const ids = new Set(profiles.filter((p) => onlyDigits(p.biz_no) === bizNo).map((p) => p.id));
    if (!ids.size) return res.json({ accounts: [] });

    const accounts = (await listAllUsers())
      .filter((u) => ids.has(u.id) && u.email)
      .map((u) => ({ email: maskEmail(u.email), google: !hasPasswordLogin(u), createdAt: u.created_at }));
    res.json({ accounts });
  } catch (err) {
    console.error('[find-email]', err.message);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

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

  // 충전/결제 내역은 매출 증빙 자료라 법령상 5년 보관해야 한다. 계정을 지우면 cascade로 원본이 사라지므로
  // 먼저 사본을 보관 테이블에 남기고, 보관에 실패하면 탈퇴를 진행하지 않는다.
  try {
    const uid = req.user.id;
    const [profile, txs, payments, vas] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabaseAdmin.from('wallet_transactions').select('*').eq('owner_id', uid),
      supabaseAdmin.from('nicepay_payments').select('*').eq('owner_id', uid),
      supabaseAdmin.from('nicepay_virtual_accounts').select('*').eq('owner_id', uid),
    ]);
    const readErr = profile.error || txs.error || payments.error || vas.error;
    if (readErr) throw readErr;

    const { error: archiveErr } = await supabaseAdmin.from('account_deletion_archive').insert({
      user_id: uid,
      email: req.user.email ?? null,
      profile: profile.data,
      wallet_transactions: txs.data,
      nicepay_payments: payments.data,
      nicepay_virtual_accounts: vas.data,
    });
    if (archiveErr) throw archiveErr;
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '거래기록 보관 중 오류가 발생하여 탈퇴를 진행하지 못했습니다. 잠시 후 다시 시도해주세요.' });
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
