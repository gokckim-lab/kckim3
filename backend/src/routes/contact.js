const express = require('express');
const { requireAuth } = require('../requireAuth');
const { supabaseAdmin } = require('../supabaseAdmin');

const router = express.Router();

// Railway 같은 클라우드 호스팅은 스팸 방지 목적으로 SMTP(25/465/587) 아웃바운드를 막아두는
// 경우가 많아 nodemailer+Gmail SMTP 방식은 응답 없이 멈춰버린다. 그래서 HTTP API 기반인
// Resend(https://resend.com)를 쓴다. 무료 가입만 하면 도메인 인증 없이 onboarding@resend.dev
// 발신 주소로 바로 보낼 수 있다.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'gokckim@gmail.com';

// 고객 문의/불만 접수: 로그인한 사용자만 보낼 수 있고, 사장님 이메일로 바로 전달된다.
router.post('/', requireAuth, async (req, res) => {
  const { subject, message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: '문의 내용을 입력해주세요.' });
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: '서버에 RESEND_API_KEY 가 설정되지 않았습니다.' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email')
    .eq('id', req.user.id)
    .single();

  const senderName = profile?.name || '(회사명 미입력)';
  const senderEmail = profile?.email || req.user.email || '';
  const finalSubject = subject?.trim() || `[Birdie Bill 문의] ${senderName}`;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Birdie Bill 문의 <onboarding@resend.dev>',
        to: [CONTACT_TO_EMAIL],
        reply_to: senderEmail || undefined,
        subject: finalSubject,
        text: `보낸 업체: ${senderName}\n보낸 계정 이메일: ${req.user.email}\n연락처 이메일: ${senderEmail}\n\n${message}`,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.json().catch(() => ({}));
      throw new Error(errBody.message || `Resend API 오류 (${resendRes.status})`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

module.exports = router;
