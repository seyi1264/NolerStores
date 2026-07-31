const express = require('express');
const fetch = require('node-fetch');
const { query } = require('../db');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const router = express.Router();

router.post('/paystack/verify', async (req, res, next) => {
  try {
    const { reference, orderId } = req.body || {};
    if (!reference || !orderId) {
      return res.status(400).json({ error: 'Order ID and payment reference are required.' });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack secret key not configured.' });
    }

    const verifyUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data.message || 'Failed to verify payment with Paystack.' });
    }

    const paid = data.data?.status === 'success';
    const orderStatus = paid ? 'paid' : data.data?.status || 'pending';

    await query(
      'update orders set status = $1, payment_provider = $2, payment_reference = $3 where id = $4',
      [orderStatus, 'paystack', reference, orderId]
    );

    res.json({ paid, status: orderStatus, paystack: data.data || null });
  } catch (err) {
    next(err);
  }
});

router.post('/paystack/webhook', (req, res) => {
  res.status(200).json({ ok: true });
});

module.exports = router;
