require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const productsRouter = require('./routes/products');
const sellersRouter = require('./routes/sellers');
const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');
const reviewsRouter = require('./routes/reviews');
const adminRouter = require('./routes/admin');
const adminMetricsRouter = require('./routes/adminMetrics');
const { requireSeller } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,https://nolerstores.vercel.app,https://nolerstores.vercel.app/admin').split(',').map((value) => value.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS not allowed'));
  },
}));
app.use('/api/payments/paystack/webhook', express.raw({ type: '*/*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nolerstores-api' }));
app.get('/seller-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'seller-dashboard.html'));
});
app.get('/seller-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'seller-dashboard.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.use('/api/admin', adminRouter);
app.use('/api/admin/metrics', adminMetricsRouter);
app.use('/api/products', productsRouter);
app.use('/api/sellers', sellersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/reviews', reviewsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NolerStores API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
