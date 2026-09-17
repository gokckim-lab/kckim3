require('dotenv').config();
const express = require('express');
const cors = require('cors');
const taxinvoiceRouter = require('./routes/taxinvoice');
const nicepayRouter = require('./routes/nicepay');
const nicepayVirtualAccountRouter = require('./routes/nicepayVirtualAccount');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));

// express.json()은 Content-Type이 application/json인 요청만 파싱하고 그 외(가상계좌
// 웹훅의 form-urlencoded 등)는 그대로 통과시키므로, 먼저 걸어둬도 /notify의 express.raw()가
// 정상적으로 원본 바디를 받는다.
app.use(express.json());
app.use('/api/payments/nicepay/virtual-account', nicepayVirtualAccountRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/popbill/taxinvoice', taxinvoiceRouter);
app.use('/api/payments/nicepay', nicepayRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Birdie Bill backend listening on http://localhost:${port}`);
});
