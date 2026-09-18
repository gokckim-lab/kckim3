const express = require('express');
const nodemailer = require('nodemailer');
const { requireAuth } = require('../requireAuth');
const { supabaseAdmin } = require('../supabaseAdmin');

const router = express.Router();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

// 고객 문의/불만 접수: 로그인한 사용자만 보낼 수 있고, 사장님 이메일로 바로 전달된다.
router.post('/', requireAuth, async (req, res) => {
  const { subject, message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: '문의 내용을 입력해주세요.' });
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: '서버에 GMAIL_USER / GMAIL_APP_PASSWORD 가 설정되지 않았습니다.' });
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
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Birdie Bill 문의" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: senderEmail || undefined,
      subject: finalSubject,
      text: `보낸 업체: ${senderName}\n보낸 계정 이메일: ${req.user.email}\n연락처 이메일: ${senderEmail}\n\n${message}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

module.exports = router;
