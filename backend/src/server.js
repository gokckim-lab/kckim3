require('dotenv').config();
const express = require('express');
const cors = require('cors');
const taxinvoiceRouter = require('./routes/taxinvoice');
const nicepayRouter = require('./routes/nicepay');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/popbill/taxinvoice', taxinvoiceRouter);
app.use('/api/payments/nicepay', nicepayRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Birdie Bill backend listening on http://localhost:${port}`);
});
