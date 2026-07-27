const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getOne, query, run } = require('../db');
const { requireSeller } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

router.post('/register', async (req, res) => {
  const { businessName, ownerName, email, password, phone, storeName, category, bio, accentColor } = req.body;
  if (!businessName || !ownerName || !email || !password || !storeName) {
    return res.status(400).json({ error: 'businessName, ownerName, email, password and storeName are required' });
  }

  const existing = await getOne(`SELECT id FROM sellers WHERE email = $1`, [email]);
  if (existing) return res.status(409).json({ error: 'Seller already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const id = uuid();
  await run(
    `INSERT INTO sellers (id, business_name, owner_name, email, password_hash, phone, store_name, category, bio, accent_color) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, businessName, ownerName, email, passwordHash, phone || null, storeName, category || null, bio || null, accentColor || '#a63a2c']
  );

  const seller = await getOne(`SELECT id, business_name, owner_name, email, phone, store_name, category, bio, accent_color FROM sellers WHERE id = $1`, [id]);
  const token = jwt.sign({ sellerId: id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ seller, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const seller = await getOne(`SELECT * FROM sellers WHERE email = $1`, [email]);
  if (!seller) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, seller.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ sellerId: seller.id, email: seller.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ seller: { ...seller, password_hash: undefined }, token });
});

router.get('/me', requireSeller, async (req, res) => {
  const seller = await getOne(`SELECT id, business_name, owner_name, email, phone, store_name, category, bio, accent_color, bank_name, account_number, account_name, verified FROM sellers WHERE id = $1`, [req.sellerId]);
  res.json({ seller });
});

router.get('/dashboard', requireSeller, async (req, res) => {
  const seller = await getOne(`SELECT id, store_name, accent_color FROM sellers WHERE id = $1`, [req.sellerId]);
  const productsCount = await getOne(`SELECT COUNT(*) AS count FROM products WHERE seller_id = $1`, [req.sellerId]);
  const orders = await query(`SELECT o.*, oi.product_id, oi.name_snapshot, oi.qty, oi.price_kobo_snapshot FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.seller_id = $1 ORDER BY o.created_at DESC`, [req.sellerId]);
  res.json({ seller, productsCount: productsCount?.count || 0, orders });
});

module.exports = router;
