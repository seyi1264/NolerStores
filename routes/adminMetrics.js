const express = require('express');
const { query } = require('../db');
const router = express.Router();
const { shapeOrder } = require('../middleware/response');

router.get('/health', async (req, res) => {
  try {
    const [ordersCount] = await query(`SELECT COUNT(*) AS value FROM orders`);
    const [pendingReviews] = await query(`SELECT COUNT(*) AS value FROM reviews WHERE approved = 0`);
    const [approvedReviews] = await query(`SELECT COUNT(*) AS value FROM reviews WHERE approved = 1`);
    const [campaigns] = await query(`SELECT COUNT(*) AS value FROM campaigns`);
    const [activeCampaigns] = await query(`SELECT COUNT(*) AS value FROM campaigns WHERE status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)`);
    res.json({
      orders: Number(ordersCount?.value || 0),
      pendingReviews: Number(pendingReviews?.value || 0),
      approvedReviews: Number(approvedReviews?.value || 0),
      campaigns: Number(campaigns?.value || 0),
      activeCampaigns: Number(activeCampaigns?.value || 0),
    });
  } catch (err) {
    console.error('Failed to load admin health metrics', err);
    res.status(500).json({ error: 'Could not load health metrics' });
  }
});

router.get('/payouts', async (req, res) => {
  try {
    const rows = await query(`SELECT id, buyer_name, buyer_email, subtotal_kobo, status, payment_provider, payment_reference, created_at FROM orders WHERE status IN ('paid', 'completed') ORDER BY created_at DESC LIMIT 50`);
    res.json({ payouts: (rows || []).map(r => ({ id: r.id, buyerName: r.buyer_name, buyerEmail: r.buyer_email, subtotalKobo: r.subtotal_kobo, subtotal: r.subtotal_kobo ? Number((r.subtotal_kobo / 100).toFixed(2)) : null, status: r.status, paymentProvider: r.payment_provider, paymentReference: r.payment_reference, createdAt: r.created_at })) });
  } catch (err) {
    console.error('Failed to load payout data', err);
    res.status(500).json({ error: 'Could not load payouts' });
  }
});

module.exports = router;
