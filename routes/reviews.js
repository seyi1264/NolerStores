const express = require('express');
const { query, run } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { v4 } = require('uuid');

const router = express.Router();

function shapeReview(row) {
  return {
    id: row.id,
    name: row.name || 'Anonymous',
    role: row.role || null,
    text: row.text,
    rating: Number(row.rating || 0),
    createdAt: row.created_at || row.createdAt || null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await query('select * from reviews where approved = 1 order by created_at desc limit 24');
    res.json({ reviews: rows.map(shapeReview) });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const rows = await query('select count(*) as count, avg(rating) as average from reviews where approved = 1');
    const stats = rows[0] || { count: 0, average: null };
    res.json({ count: Number(stats.count || 0), average: stats.average ? Number(Number(stats.average).toFixed(1)) : 0 });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, role, text, rating = 5, hp } = req.body || {};

    if (hp) {
      return res.status(201).json({ ok: true });
    }

    if (!text || String(text).trim().length < 10) {
      return res.status(400).json({ error: 'Review text is too short.' });
    }

    const id = v4();
    await run(
      'insert into reviews (id, name, role, text, rating, approved, ip, user_agent, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        id,
        name || null,
        role || null,
        String(text).trim(),
        Number(rating) || 5,
        0,
        req.ip || null,
        req.get('user-agent') || null,
        new Date().toISOString(),
      ]
    );
    res.status(201).json({ ok: true, reviewId: id });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    await run('update reviews set approved = 1 where id = $1', [reviewId]);
    await run(
      'insert into review_actions (id, review_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), reviewId, 'approved', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({}), new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/stream', async (req, res, next) => {
  try {
    res.set({
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write(': connected\n\n');

    let lastSeen = new Date().toISOString();
    const interval = setInterval(async () => {
      try {
        const rows = await query('select * from reviews where approved = 1 and created_at > $1 order by created_at asc', [lastSeen]);
        if (rows.length > 0) {
          rows.forEach((row) => {
            lastSeen = row.created_at || lastSeen;
            res.write(`event: review\ndata: ${JSON.stringify(shapeReview(row))}\n\n`);
          });
        }
      } catch (err) {
        console.warn('Review stream polling error', err);
      }
    }, 5000);

    req.on('close', () => {
      clearInterval(interval);
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
