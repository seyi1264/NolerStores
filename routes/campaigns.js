const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const campaigns = await query(`
      SELECT id, name, description, status, starts_at, ends_at, image_url, cta_url, created_at
      FROM campaigns
      WHERE status = 'active'
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
      ORDER BY starts_at NULLS FIRST, created_at DESC
    `);
    res.json({ campaigns });
  } catch (err) {
    console.error('Could not load campaigns', err);
    res.status(500).json({ error: 'Could not load campaigns' });
  }
});

module.exports = router;
