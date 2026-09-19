require('dotenv').config();
const express = require('express');
const cors = require('cors');
const taxinvoiceRouter = require('./routes/taxinvoice');
const nicepayRouter = require('./routes/nicepay');
const nicepayVirtualAccountRouter = require('./routes/nicepayVirtualAccount');
const contactRouter = require('./routes/contact');
const accountRouter = require('./routes/account');

const app = express();

// 커스텀 도메인(birdiebill.co.kr) 연결 후에도 예전 vercel.app 주소와 www 서브도메인까지
// 전부 허용해야, 어느 주소로 접속하든 프론트엔드에서 백엔드 API 호출이 CORS에 막히지 않는다.
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  'http://localhost:5173',
  'https://birdiebill.co.kr',
  'https://www.birdiebill.co.kr',
  'https://birdiebill.vercel.app',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
}));

// express.json()은 Content-Type이 application/json인 요청만 파싱하고 그 외(가상계좌
// 웹훅의 form-urlencoded 등)는 그대로 통과시키므로, 먼저 걸어둬도 /notify의 express.raw()가
// 정상적으로 원본 바디를 받는다.
app.use(express.json());
app.use('/api/payments/nicepay/virtual-account', nicepayVirtualAccountRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/popbill/taxinvoice', taxinvoiceRouter);
app.use('/api/payments/nicepay', nicepayRouter);
app.use('/api/contact', contactRouter);
app.use('/api/account', accountRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Birdie Bill backend listening on http://localhost:${port}`);
});
