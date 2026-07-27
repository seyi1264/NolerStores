require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const productsRouter = require('./routes/products');
const sellersRouter = require('./routes/sellers');
const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Paystack webhook needs the raw body for signature verification, so it's
// mounted before the JSON body parser strips it.
app.use('/api/payments/paystack/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nolerstores-api' }));

app.use('/api/products', productsRouter);
app.use('/api/sellers', sellersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`NolerStores API running on http://localhost:${PORT}`);
});
