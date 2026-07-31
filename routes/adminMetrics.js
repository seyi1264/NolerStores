const express = require('express');
const { query } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/health', requireAdmin, async (req, res, next) => {
  try {
    const [ordersCount] = await query('select count(*) as count from orders');
    const [pendingReviews] = await query('select count(*) as count from reviews where approved = 0');
    const [approvedReviews] = await query('select count(*) as count from reviews where approved = 1');
    const [campaignsCount] = await query('select count(*) as count from campaigns');
    const [activeCampaigns] = await query("select count(*) as count from campaigns where status = 'active'");

    res.json({
      orders: Number(ordersCount?.count || 0),
      pendingReviews: Number(pendingReviews?.count || 0),
      approvedReviews: Number(approvedReviews?.count || 0),
      campaigns: Number(campaignsCount?.count || 0),
      activeCampaigns: Number(activeCampaigns?.count || 0),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/payouts', requireAdmin, async (req, res, next) => {
  try {
    const rows = await query(
      'select id, buyer_name, buyer_email, subtotal_kobo, payment_provider, payment_reference, created_at from orders where status = $1 order by created_at desc limit 50',
      ['paid']
    );
    res.json({ payouts: rows.map((row) => ({
      id: row.id,
      buyer_name: row.buyer_name,
      buyer_email: row.buyer_email,
      subtotal_kobo: row.subtotal_kobo,
      payment_provider: row.payment_provider,
      payment_reference: row.payment_reference,
      created_at: row.created_at,
    })) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
