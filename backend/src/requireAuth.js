const { supabaseAdmin } = require('./supabaseAdmin');

// 프론트에서 보낸 Supabase 액세스 토큰을 검증해 req.user 에 담는다.
// 이 서버는 팝빌 SecretKey 를 보관하므로, 로그인한 사용자만 호출할 수 있도록 막는다.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: '인증 토큰이 없습니다.' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: '유효하지 않은 세션입니다.' });

    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '인증 확인 중 오류가 발생했습니다.' });
  }
}

module.exports = { requireAuth };
