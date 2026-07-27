const express = require('express');
const { query, run } = require('../db');
const { v4: uuid } = require('uuid');

const router = express.Router();

// In-memory rate limiter: ip -> array of timestamps (ms)
const rateMap = new Map();
const MAX_PER_HOUR = 5;
const MIN_INTERVAL_MS = 30 * 1000; // 30 seconds between submissions

function cleanRateMap(){
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, arr] of rateMap.entries()){
    const filtered = arr.filter(t => t >= cutoff);
    if (filtered.length === 0) rateMap.delete(ip); else rateMap.set(ip, filtered);
  }
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

// Public submit endpoint with basic spam/bot protections
router.post('/', async (req, res) => {
  try {
    cleanRateMap();
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
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
    if (trimmed.length > 2000) {
      return res.status(400).json({ error: 'Review text is too long' });
    }

    // Block URLs to reduce spam
    if (/https?:\/\//i.test(trimmed) || /<a\s+/i.test(trimmed)) {
      return res.status(400).json({ error: 'No links allowed in reviews' });
    }

    // Rate limiting
    const now = Date.now();
    const entries = rateMap.get(ip) || [];
    if (entries.length > 0 && (now - entries[entries.length - 1]) < MIN_INTERVAL_MS) {
      return res.status(429).json({ error: 'Please wait before submitting another review' });
    }
    const recentCount = entries.filter(t => t >= now - (60 * 60 * 1000)).length;
    if (recentCount >= MAX_PER_HOUR) {
      return res.status(429).json({ error: 'Rate limit exceeded for review submissions' });
    }
    entries.push(now);
    rateMap.set(ip, entries);

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

module.exports = router;
