const express = require('express');
const jwt = require('jsonwebtoken');
const { query, run, getOne } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { shapeCampaign } = require('../middleware/response');
const { v4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function shapeReview(row) {
  return {
    id: row.id,
    name: row.name || 'Anonymous',
    role: row.role || null,
    text: row.text,
    rating: Number(row.rating || 0),
    approved: Boolean(row.approved),
    created_at: row.created_at || row.createdAt || null,
  };
}

function shapeAuditAction(row) {
  return {
    id: row.id,
    action: row.action,
    review_id: row.review_id || row.resource_id || null,
    campaign_id: row.campaign_id || row.resource_id || null,
    actor: row.actor,
    reason: row.reason,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    created_at: row.created_at || row.createdAt || null,
  };
}

function normalizeDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!ADMIN_USER || !ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Admin credentials are not configured.' });
    }
    if (!username || !password || username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin username or password' });
    }
    const token = jwt.sign({ admin: true, username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.get('/reviews/pending', requireAdmin, async (req, res, next) => {
  try {
    const rows = await query('select * from reviews where approved = 0 order by created_at desc limit 100');
    res.json({ reviews: rows.map(shapeReview) });
  } catch (err) {
    next(err);
  }
});

router.get('/reviews/search', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ reviews: [] });
    const like = `%${q}%`;
    const rows = await query(
      `select * from reviews where approved = 0 and (lower(name) like lower($1) or lower(role) like lower($1) or lower(text) like lower($1)) order by created_at desc limit 100`,
      [like]
    );
    res.json({ reviews: rows.map(shapeReview) });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews/:id/approve', requireAdmin, async (req, res, next) => {
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

router.delete('/reviews/:id', requireAdmin, async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const auditReason = req.body?.reason || 'Rejected via admin portal';
    await run('delete from reviews where id = $1', [reviewId]);
    await run(
      'insert into review_actions (id, review_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), reviewId, 'deleted', req.admin.username || 'admin', req.ip || null, auditReason, JSON.stringify({}), new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/reviews/audit', requireAdmin, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const rows = await query('select * from review_actions order by created_at desc limit $1', [limit]);
    res.json({ actions: rows.map((row) => ({
      id: row.id,
      action: row.action,
      review_id: row.review_id,
      actor: row.actor,
      reason: row.reason,
      metadata: row.metadata,
      created_at: row.created_at,
    })) });
  } catch (err) {
    next(err);
  }
});

router.get('/campaigns', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const baseSql = 'select * from campaigns';
    let rows;
    if (q) {
      const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      rows = await query(`${baseSql} where name ilike $1 or description ilike $1 order by created_at desc limit 100`, [like]);
    } else {
      rows = await query(`${baseSql} order by created_at desc limit 200`, []);
    }
    res.json({ campaigns: rows.map(shapeCampaign) });
  } catch (err) {
    next(err);
  }
});

router.post('/campaigns', requireAdmin, async (req, res, next) => {
  try {
    const { name, description, imageUrl, ctaUrl, startsAt, endsAt, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Campaign name is required.' });
    const now = new Date().toISOString();
    const id = v4();
    const normalizedStartsAt = normalizeDateValue(startsAt);
    const normalizedEndsAt = normalizeDateValue(endsAt);
    await run(
      'insert into campaigns (id, name, description, image_url, cta_url, starts_at, ends_at, status, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, name, description || null, imageUrl || null, ctaUrl || null, normalizedStartsAt, normalizedEndsAt, status || 'draft', now]
    );
    await run(
      'insert into campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), id, 'created', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({}), now]
    );
    res.status(201).json({ campaign: shapeCampaign({ id, name, description, status: status || 'draft', starts_at: normalizedStartsAt, ends_at: normalizedEndsAt, image_url: imageUrl || null, cta_url: ctaUrl || null, created_at: now }) });
  } catch (err) {
    next(err);
  }
});

router.put('/campaigns/:id', requireAdmin, async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const { name, description, imageUrl, ctaUrl, startsAt, endsAt, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Campaign name is required.' });
    const normalizedStartsAt = normalizeDateValue(startsAt);
    const normalizedEndsAt = normalizeDateValue(endsAt);
    const existing = await getOne('select * from campaigns where id = $1', [campaignId]);
    const now = new Date().toISOString();
    if (!existing) {
      await run(
        'insert into campaigns (id, name, description, image_url, cta_url, starts_at, ends_at, status, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [campaignId, name, description || null, imageUrl || null, ctaUrl || null, normalizedStartsAt, normalizedEndsAt, status || 'draft', now]
      );
      await run(
        'insert into campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [v4(), campaignId, 'created', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({ createdByPut: true }), now]
      );
      return res.status(201).json({ campaign: shapeCampaign({ id: campaignId, name, description, status: status || 'draft', starts_at: normalizedStartsAt, ends_at: normalizedEndsAt, image_url: imageUrl || null, cta_url: ctaUrl || null, created_at: now }) });
    }

    await run(
      'update campaigns set name = $1, description = $2, image_url = $3, cta_url = $4, starts_at = $5, ends_at = $6, status = $7 where id = $8',
      [name, description || null, imageUrl || null, ctaUrl || null, normalizedStartsAt, normalizedEndsAt, status || 'draft', campaignId]
    );
    await run(
      'insert into campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), campaignId, 'updated', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({ updated: true }), now]
    );
    res.json({ campaign: shapeCampaign({ id: campaignId, name, description, status: status || 'draft', starts_at: normalizedStartsAt, ends_at: normalizedEndsAt, image_url: imageUrl || null, cta_url: ctaUrl || null, created_at: existing.created_at }) });
  } catch (err) {
    next(err);
  }
});

router.delete('/campaigns/:id', requireAdmin, async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const existing = await getOne('select * from campaigns where id = $1', [campaignId]);
    if (!existing) return res.status(404).json({ error: 'Campaign not found.' });
    await run('delete from campaigns where id = $1', [campaignId]);
    await run(
      'insert into campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), campaignId, 'deleted', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({}), new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/campaigns/bulk-status', requireAdmin, async (req, res, next) => {
  try {
    const { campaignIds, status } = req.body || {};
    if (!Array.isArray(campaignIds) || !campaignIds.length) {
      return res.status(400).json({ error: 'campaignIds are required.' });
    }
    if (!status) {
      return res.status(400).json({ error: 'status is required.' });
    }
    const placeholders = campaignIds.map((_, index) => `$${index + 1}`).join(',');
    await run(`update campaigns set status = $${campaignIds.length + 1} where id in (${placeholders})`, [...campaignIds, status]);
    await run(
      'insert into campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [v4(), campaignIds.join(','), 'bulk_status_updated', req.admin.username || 'admin', req.ip || null, null, JSON.stringify({ status, campaignIds }), new Date().toISOString()]
    );
    res.json({ ok: true, updated: campaignIds.length });
  } catch (err) {
    next(err);
  }
});

router.get('/campaigns/audit', requireAdmin, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const q = (req.query.q || '').trim();
    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = await query(
        'select * from campaign_actions where lower(action) like lower($1) or lower(reason) like lower($1) or lower(metadata) like lower($1) order by created_at desc limit $2',
        [like, limit]
      );
    } else {
      rows = await query('select * from campaign_actions order by created_at desc limit $1', [limit]);
    }
    res.json({ actions: rows.map((row) => ({
      id: row.id,
      campaign_id: row.campaign_id,
      action: row.action,
      actor: row.actor,
      reason: row.reason,
      metadata: row.metadata,
      created_at: row.created_at,
    })) });
  } catch (err) {
    next(err);
  }
});

router.post('/uploads', requireAdmin, async (req, res, next) => {
  try {
    if (!req.headers['content-type'] || !req.headers['content-type'].startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Multipart form data required for upload.' });
    }
    // Delegate to uploads router by letting server handle the route.
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
