const express = require('express');
const fetch = require('node-fetch');
const { getOne, run } = require('../db');

const router = express.Router();
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

router.post('/paystack/initialize', async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY not configured on server' });
  const { orderId } = req.body;
  const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const reference = `noler_${order.id}`;
  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: order.buyer_email,
      amount: order.subtotal_kobo,
      currency: 'NGN',
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
      metadata: { orderId: order.id },
    }),
  });
  const data = await resp.json();
  if (!data.status) return res.status(502).json({ error: data.message || 'Paystack initialize failed' });

  await run(`UPDATE orders SET payment_provider = $1, payment_reference = $2 WHERE id = $3`, ['paystack', reference, order.id]);
  res.json({ authorizationUrl: data.data.authorization_url, reference, accessCode: data.data.access_code });
});

router.post('/paystack/verify', async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY not configured on server' });
  const { reference, orderId } = req.body;
  if (!reference || !orderId) return res.status(400).json({ error: 'reference and orderId are required' });

  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await resp.json();
  if (!data.status) return res.status(502).json({ error: data.message || 'Verification failed' });

  const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const paid = data.data.status === 'success' && data.data.amount === order.subtotal_kobo;
  await run(`UPDATE orders SET status = $1, payment_provider = $2, payment_reference = $3 WHERE id = $4`, [paid ? 'paid' : 'failed', 'paystack', reference, orderId]);
  const updatedOrder = await getOne(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  res.json({ paid, order: updatedOrder });
});

router.post('/paystack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const crypto = require('crypto');
  const signature = req.headers['x-paystack-signature'];
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY || '').update(req.body).digest('hex');
  if (hash !== signature) return res.sendStatus(401);

  const event = JSON.parse(req.body.toString());
  if (event.event === 'charge.success') {
    const { reference, amount, metadata } = event.data;
    const orderId = metadata?.orderId;
    if (orderId) {
      const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      if (order && amount === order.subtotal_kobo) {
        await run(`UPDATE orders SET status = $1, payment_reference = $2 WHERE id = $3`, ['paid', reference, orderId]);
      }
    }
  }
  res.sendStatus(200);
});

module.exports = router;
