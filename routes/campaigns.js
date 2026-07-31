const express = require('express');
const { query } = require('../db');
const campaignsStore = require('../services/campaignsStore');

const router = express.Router();
const { shapeCampaign } = require('../middleware/response');

router.get('/', async (req, res) => {
  try {
    // Load active campaigns from DB and then apply start/end filtering in JS.
    // Doing this in JS avoids SQL dialect differences and timezone parsing issues
    // between Postgres and SQLite.
    const rows = await query(
      `SELECT id, name, description, status, starts_at, ends_at, image_url, cta_url, created_at FROM campaigns WHERE status = 'active' ORDER BY created_at DESC`
    );

    const now = Date.now();
    const campaigns = (rows || [])
      .map(shapeCampaign)
      .filter((c) => {
        try {
          if (!c) return false;
          const starts = c.startsAt ? Date.parse(c.startsAt) : null;
          const ends = c.endsAt ? Date.parse(c.endsAt) : null;
          if (starts && isNaN(starts)) {
            // treat as no start
          }
          if (ends && isNaN(ends)) {
            // treat as no end
          }
          if (starts && starts > now) return false;
          if (ends && ends < now) return false;
          return true;
        } catch (err) {
          return true;
        }
      });

    res.json({ campaigns });
  } catch (err) {
    console.error('Could not load campaigns', err);
    res.status(500).json({ error: 'Could not load campaigns' });
  }
});

module.exports = router;
