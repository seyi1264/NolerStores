const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { query, run, getOne } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || null;
const adminPassword = process.env.ADMIN_PASSWORD || null;

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.admin) return res.status(403).json({ error: 'Admin access required' });
    req.admin = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function logReviewAction({ reviewId, action, actor, actorIp, reason, metadata }) {
  const id = uuid();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  await run(`INSERT INTO review_actions (id, review_id, action, actor, actor_ip, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    id, reviewId, action, actor, actorIp, reason || null, metadataJson,
  ]);
}

async function logCampaignAction({ campaignId, action, actor, actorIp, reason, metadata }) {
  const id = uuid();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  await run(`INSERT INTO campaign_actions (id, campaign_id, action, actor, actor_ip, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    id, campaignId, action, actor, actorIp, reason || null, metadataJson,
  ]);
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username !== adminUser) return res.status(401).json({ error: 'Invalid credentials' });

  let valid = false;
  if (adminPasswordHash) {
    valid = await bcrypt.compare(password, adminPasswordHash);
  } else if (adminPassword) {
    valid = password === adminPassword;
  }

  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ admin: true, username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

router.get('/reviews/pending', requireAdmin, async (req, res) => {
  const reviews = await query(`SELECT id, name, role, text, rating, approved, ip, user_agent, created_at FROM reviews WHERE approved = 0 ORDER BY created_at DESC`);
  res.json({ reviews });
});

router.post('/reviews/:id/approve', requireAdmin, async (req, res) => {
  const reviewId = req.params.id;
  const review = await getOne(`SELECT id FROM reviews WHERE id = $1`, [reviewId]);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  await run(`UPDATE reviews SET approved = 1 WHERE id = $1`, [reviewId]);
  await logReviewAction({ reviewId, action: 'approved', actor: req.admin.username, actorIp: req.ip, metadata: { note: 'Approved via admin portal' } });
  const updatedReview = await getOne(`SELECT id, name, role, text, rating, approved, created_at FROM reviews WHERE id = $1`, [reviewId]);
  res.json({ review: updatedReview });
});

router.delete('/reviews/:id', requireAdmin, async (req, res) => {
  const reviewId = req.params.id;
  const review = await getOne(`SELECT id FROM reviews WHERE id = $1`, [reviewId]);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  await run(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
  await logReviewAction({ reviewId, action: 'deleted', actor: req.admin.username, actorIp: req.ip, reason: req.body?.reason || 'deleted by admin' });
  res.json({ ok: true });
});

router.get('/reviews/search', requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Number(req.query.limit) || 50;
  const where = q ? `WHERE approved = 0 AND (text LIKE '%' || $1 || '%' OR name LIKE '%' || $1 || '%' OR role LIKE '%' || $1 || '%')` : 'WHERE approved = 0';
  const params = q ? [q] : [];
  const reviews = await query(`SELECT id, name, role, text, rating, approved, ip, user_agent, created_at FROM reviews ${where} ORDER BY created_at DESC LIMIT $${params.length + 1}`, [...params, limit]);
  res.json({ reviews });
});

router.get('/reviews/audit', requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const actions = await query(`SELECT id, review_id, action, actor, actor_ip, reason, metadata, created_at FROM review_actions ORDER BY created_at DESC LIMIT $1`, [limit]);
  res.json({ actions });
});

router.get('/campaigns', requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE (LOWER(name) LIKE LOWER('%' || $1 || '%') OR LOWER(description) LIKE LOWER('%' || $1 || '%'))` : '';
  const params = q ? [q] : [];
  const campaigns = await query(`SELECT id, name, description, status, starts_at, ends_at, created_at FROM campaigns ${where} ORDER BY created_at DESC`, params);
  res.json({ campaigns });
});

router.post('/campaigns', requireAdmin, async (req, res) => {
  const { name, description, status, starts_at, ends_at } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Campaign name is required' });
  const id = uuid();
  await run(`INSERT INTO campaigns (id, name, description, status, starts_at, ends_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
    id,
    name.trim(),
    description || null,
    status || 'draft',
    starts_at || null,
    ends_at || null,
  ]);
  await logCampaignAction({ campaignId: id, action: 'created', actor: req.admin.username, actorIp: req.ip, metadata: { name: name.trim(), status, starts_at, ends_at } });
  const campaign = await getOne(`SELECT id, name, description, status, starts_at, ends_at, created_at FROM campaigns WHERE id = $1`, [id]);
  res.status(201).json({ campaign });
});

router.put('/campaigns/:id', requireAdmin, async (req, res) => {
  const campaignId = req.params.id;
  const existing = await getOne(`SELECT id FROM campaigns WHERE id = $1`, [campaignId]);
  if (!existing) return res.status(404).json({ error: 'Campaign not found' });
  const { name, description, status, starts_at, ends_at } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Campaign name is required' });
  await run(`UPDATE campaigns SET name = $1, description = $2, status = $3, starts_at = $4, ends_at = $5 WHERE id = $6`, [
    name.trim(),
    description || null,
    status || 'draft',
    starts_at || null,
    ends_at || null,
    campaignId,
  ]);
  await logCampaignAction({ campaignId, action: 'updated', actor: req.admin.username, actorIp: req.ip, metadata: { name: name.trim(), status, starts_at, ends_at } });
  const campaign = await getOne(`SELECT id, name, description, status, starts_at, ends_at, created_at FROM campaigns WHERE id = $1`, [campaignId]);
  res.json({ campaign });
});

router.delete('/campaigns/:id', requireAdmin, async (req, res) => {
  const campaignId = req.params.id;
  const existing = await getOne(`SELECT id FROM campaigns WHERE id = $1`, [campaignId]);
  if (!existing) return res.status(404).json({ error: 'Campaign not found' });
  await run(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  await logCampaignAction({ campaignId, action: 'deleted', actor: req.admin.username, actorIp: req.ip, reason: req.body?.reason || 'Deleted via admin portal' });
  res.json({ ok: true });
});

router.post('/campaigns/bulk-status', requireAdmin, async (req, res) => {
  const { campaignIds, status } = req.body || {};
  if (!Array.isArray(campaignIds) || !campaignIds.length) return res.status(400).json({ error: 'campaignIds are required' });
  if (!status || !['active', 'paused', 'draft'].includes(status)) return res.status(400).json({ error: 'Valid status is required' });
  const placeholders = campaignIds.map((_, index) => `$${index + 1}`).join(', ');
  await run(`UPDATE campaigns SET status = $${campaignIds.length + 1} WHERE id IN (${placeholders})`, [...campaignIds, status]);
  for (const campaignId of campaignIds) {
    await logCampaignAction({ campaignId, action: 'bulk-updated', actor: req.admin.username, actorIp: req.ip, metadata: { status } });
  }
  res.json({ ok: true, updated: campaignIds.length });
});

router.get('/campaigns/audit', requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE (LOWER(action) LIKE LOWER('%' || $1 || '%') OR LOWER(reason) LIKE LOWER('%' || $1 || '%') OR LOWER(metadata) LIKE LOWER('%' || $1 || '%'))` : '';
  const params = q ? [q, limit] : [limit];
  const actions = await query(`SELECT id, campaign_id, action, actor, actor_ip, reason, metadata, created_at FROM campaign_actions ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  res.json({ actions });
});

module.exports = router;
