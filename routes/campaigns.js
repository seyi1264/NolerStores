const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Load active campaigns from DB and then apply start/end filtering in JS.
    // Doing this in JS avoids SQL dialect differences and timezone parsing issues
    // between Postgres and SQLite.
    const rows = await query(`
      SELECT id, name, description, status, starts_at, ends_at, image_url, cta_url, created_at
      FROM campaigns
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const now = Date.now();
    const campaigns = (rows || []).filter((c) => {
      try {
        if (!c) return false;
        const starts = c.starts_at ? Date.parse(c.starts_at) : null;
        const ends = c.ends_at ? Date.parse(c.ends_at) : null;
        if (starts && isNaN(starts)) {
          // If parse failed, treat as no start date
        }
        if (ends && isNaN(ends)) {
          // If parse failed, treat as no end date
        }
        if (starts && starts > now) return false; // not started yet
        if (ends && ends < now) return false; // already ended
        return true;
      } catch (err) {
        return true; // if anything goes wrong, include the campaign
      }
    });

    res.json({ campaigns });
  } catch (err) {
    console.error('Could not load campaigns', err);
    res.status(500).json({ error: 'Could not load campaigns' });
  }
});

module.exports = router;
