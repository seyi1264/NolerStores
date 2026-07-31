const express = require('express');
const { query } = require('../db');
const { shapeCampaign } = require('../middleware/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(`select * from campaigns where coalesce(status, 'draft') != $1 order by starts_at desc`, ['draft']);
    res.json({ campaigns: rows.map(shapeCampaign) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
