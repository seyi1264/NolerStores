const express = require('express');
const { query, run, getOne } = require('../db');
const { v4: uuid } = require('uuid');
const Redis = require('ioredis');

// Initialize Redis if configured. Fall back to in-memory limiter if not.
const redisUrl = process.env.REDIS_URL || process.env.REDIS;
let redis = null;
if (redisUrl) {
  try {
    redis = new Redis(redisUrl);
    redis.on('error', (e) => console.warn('Redis error', e));
  } catch (err) {
    console.warn('Could not initialize Redis, continuing without it', err);
    redis = null;
  }
}

const router = express.Router();

// Rate limit settings
const MAX_PER_HOUR = Number(process.env.REVIEWS_MAX_PER_HOUR || 5);
const MIN_INTERVAL_MS = Number(process.env.REVIEWS_MIN_INTERVAL_MS || (30 * 1000));

// In-memory fallback when Redis not present
const rateMap = new Map();

function cleanRateMap(){
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, arr] of rateMap.entries()){
    const filtered = arr.filter(t => t >= cutoff);
    if (filtered.length === 0) rateMap.delete(ip); else rateMap.set(ip, filtered);
  }
}

async function checkAndRecordRate(ip){
  const now = Date.now();
  if (redis) {
    const lastKey = `reviews:last:${ip}`;
    const cntKey = `reviews:count:${ip}`;
    const last = await redis.get(lastKey);
    if (last && (now - Number(last)) < MIN_INTERVAL_MS) {
      return { ok: false, reason: 'interval' };
    }
    const cnt = await redis.incr(cntKey);
    if (cnt === 1) await redis.expire(cntKey, 60 * 60);
    if (cnt > MAX_PER_HOUR) return { ok: false, reason: 'rate' };
    await redis.set(lastKey, String(now), 'EX', 60 * 60);
    return { ok: true };
  }

  // fallback in-memory
  cleanRateMap();
  const entries = rateMap.get(ip) || [];
  if (entries.length > 0 && (now - entries[entries.length - 1]) < MIN_INTERVAL_MS) return { ok: false, reason: 'interval' };
  const recentCount = entries.filter(t => t >= now - (60 * 60 * 1000)).length;
  if (recentCount >= MAX_PER_HOUR) return { ok: false, reason: 'rate' };
  entries.push(now); rateMap.set(ip, entries);
  return { ok: true };
}

router.get('/', async (req, res) => {
  try {
    const reviews = await query(
      `SELECT id, name, role, text, rating, created_at FROM reviews WHERE approved = 1 ORDER BY created_at DESC LIMIT 6`
    );
    res.json({ reviews });
  } catch (err) {
    console.error('Failed to load reviews', err);
    res.status(500).json({ error: 'Could not load reviews' });
  }
});

// SSE stream for live approved reviews
const sseClients = new Set();
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 10000\n\n');
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
});

function broadcastReview(review){
  const payload = JSON.stringify(review);
  for (const client of sseClients){
    try {
      client.write(`event: review\n`);
      client.write(`data: ${payload}\n\n`);
    } catch (err){
      sseClients.delete(client);
    }
  }
}

// Public submit endpoint with basic spam/bot protections
router.post('/', async (req, res) => {
  try {
    // rate limiting via Redis or in-memory fallback
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const rateCheck = await checkAndRecordRate(ip);
    if (!rateCheck.ok) {
      if (rateCheck.reason === 'interval') return res.status(429).json({ error: 'Please wait before submitting another review' });
      return res.status(429).json({ error: 'Rate limit exceeded for review submissions' });
    }
    const ua = (req.get('User-Agent') || '').slice(0, 512);
    const { name, role, text, rating = 5, hp, recaptchaToken } = req.body || {};

    // If a recaptcha token is provided and a secret exists, verify it with Google.
    const recaptchaSecret = process.env.RECAPTCHA_SECRET;
    if (recaptchaToken && recaptchaSecret) {
      try {
        const params = new URLSearchParams();
        params.append('secret', recaptchaSecret);
        params.append('response', recaptchaToken);
        const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
        });
        const verifyJson = await verifyRes.json();
        if (!verifyJson.success) {
          console.warn('reCAPTCHA failed', verifyJson);
          return res.status(400).json({ error: 'reCAPTCHA verification failed' });
        }
      } catch (err) {
        console.warn('reCAPTCHA verify error', err);
        return res.status(400).json({ error: 'reCAPTCHA verification failed' });
      }
    }

    // Honeypot: must be empty
    if (hp) {
      return res.status(400).json({ error: 'Bad request' });
    }

    const trimmed = (text || '').toString().trim();
    if (!trimmed || trimmed.length < 20) {
      return res.status(400).json({ error: 'Review text is too short' });
    }
    if (trimmed.length > 500) {
      return res.status(400).json({ error: 'Review text is too long (max 500 chars)' });
    }

    // Block URLs to reduce spam
    if (/https?:\/\//i.test(trimmed) || /<a\s+/i.test(trimmed)) {
      return res.status(400).json({ error: 'No links allowed in reviews' });
    }

    // (rate check already performed above)

    // Insert into DB as unapproved (requires admin verification)
    const id = uuid();
    await run(`INSERT INTO reviews (id, name, role, text, rating, approved, ip, user_agent) VALUES ($1,$2,$3,$4,$5,0,$6,$7)`, [
      id,
      name || null,
      role || null,
      trimmed,
      Math.max(1, Math.min(5, Number(rating) || 5)),
      ip,
      ua,
    ]);

    res.status(201).json({ ok: true, message: 'Thank you — your review is awaiting moderation.' });
  } catch (err) {
    console.error('Failed to submit review', err);
    res.status(500).json({ error: 'Could not submit review' });
  }
});

// Allow admin deletion of a review
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Admin authorization required' });
    const id = req.params.id;
    const existing = await getOne(`SELECT id FROM reviews WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    await run(`DELETE FROM reviews WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete review', err);
    res.status(500).json({ error: 'Could not delete review' });
  }
});

  function isAdminRequest(req){
    const adminSecret = process.env.ADMIN_SECRET || process.env.SELLER_ADMIN_SECRET;
    if (!adminSecret) return false;
    const headerSecret = req.headers['x-admin-secret'] || req.headers['x-seller-admin-secret'];
    return headerSecret === adminSecret;
  }

  // Admin: approve a review and broadcast it
  router.post('/:id/approve', async (req, res) => {
    try {
      if (!isAdminRequest(req)) return res.status(403).json({ error: 'Admin authorization required' });
      const id = req.params.id;
      const existing = await getOne(`SELECT id FROM reviews WHERE id = $1`, [id]);
      if (!existing) return res.status(404).json({ error: 'Review not found' });
      await run(`UPDATE reviews SET approved = 1 WHERE id = $1`, [id]);
      const review = await getOne(`SELECT id, name, role, text, rating, created_at FROM reviews WHERE id = $1`, [id]);
      if (review) broadcastReview(review);
      res.json({ ok: true, review });
    } catch (err){
      console.error('Failed to approve review', err);
      res.status(500).json({ error: 'Could not approve review' });
    }
  });

// Admin: list pending (unapproved) reviews
router.get('/pending', async (req, res) => {
  try {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Admin authorization required' });
    const reviews = await query(
      `SELECT id, name, role, text, rating, created_at FROM reviews WHERE approved = 0 ORDER BY created_at DESC`
    );
    res.json({ reviews });
  } catch (err) {
    console.error('Failed to load pending reviews', err);
    res.status(500).json({ error: 'Could not load pending reviews' });
  }
});

// Public stats: average rating and count of approved reviews
router.get('/stats', async (req, res) => {
  try {
    const rows = await query(`SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE approved = 1`);
    const r = rows && rows[0] ? rows[0] : { count: 0, avg_rating: null };
    // Normalize types
    const count = Number(r.count || 0);
    const avg = r.avg_rating == null ? null : Number(Number(r.avg_rating).toFixed(2));
    res.json({ count, average: avg });
  } catch (err) {
    console.error('Failed to load review stats', err);
    res.status(500).json({ error: 'Could not load review stats' });
  }
});

module.exports = router;
