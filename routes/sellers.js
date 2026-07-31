const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getOne } = require('../db');
const { shapeSeller, shapeProducts } = require('../middleware/response');
const { requireSeller } = require('../middleware/auth');
const { v4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const {
      businessName,
      ownerName,
      email,
      password,
      phone,
      storeName,
      category,
      bio,
      accentColor,
      bankName,
      accountNumber,
      accountName,
    } = req.body || {};

    if (!businessName || !ownerName || !email || !password || !storeName) {
      return res.status(400).json({ error: 'Missing required seller information.' });
    }

    const existing = await getOne('select id from sellers where email = $1 or store_name = $2', [email, storeName]);
    if (existing) {
      return res.status(409).json({ error: 'A seller account with that email or store name already exists.' });
    }

    const id = v4();
    const passwordHash = bcrypt.hashSync(password, 10);
    const createdAt = new Date().toISOString();

    await query(
      'insert into sellers (id, business_name, owner_name, email, password_hash, phone, store_name, category, bio, accent_color, bank_name, account_number, account_name, verified, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [
        id,
        businessName,
        ownerName,
        email,
        passwordHash,
        phone || null,
        storeName,
        category || null,
        bio || null,
        accentColor || '#a63a2c',
        bankName || null,
        accountNumber || null,
        accountName || null,
        0,
        createdAt,
      ]
    );

    const token = jwt.sign({ sellerId: id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ seller: shapeSeller({ id, business_name: businessName, owner_name: ownerName, email, phone, store_name: storeName, category, bio, accent_color: accentColor || '#a63a2c', bank_name: bankName, account_number: accountNumber, account_name: accountName, verified: 0, created_at: createdAt }), token });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const seller = await getOne('select * from sellers where email = $1', [email]);
    if (!seller) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = bcrypt.compareSync(password, seller.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ sellerId: seller.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ seller: shapeSeller(seller), token });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, JWT_SECRET);
    const seller = await getOne('select * from sellers where id = $1', [payload.sellerId]);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    res.json({ seller: shapeSeller(seller) });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
});

router.get('/me/summary', requireSeller, async (req, res, next) => {
  try {
    const sellerId = req.sellerId;
    const productCountRows = await query('select count(*) as count from products where seller_id = $1 and active = 1', [sellerId]);
    const productCount = Number(productCountRows[0]?.count || 0);

    const orderRows = await query(`
      select oi.order_id, oi.qty, oi.price_kobo_snapshot, o.status
      from order_items oi
      join orders o on oi.order_id = o.id
      where oi.seller_id = $1
    `, [sellerId]);

    const revenueKobo = orderRows.reduce((sum, row) => sum + ((Number(row.price_kobo_snapshot) || 0) * (Number(row.qty) || 0)), 0);
    const orderCount = new Set(orderRows.map(row => row.order_id)).size;

    res.json({ productCount, orderCount, revenueKobo });
  } catch (err) {
    next(err);
  }
});

router.get('/me/products', requireSeller, async (req, res, next) => {
  try {
    const rows = await query('select * from products where seller_id = $1 order by created_at desc', [req.sellerId]);
    res.json({ products: shapeProducts(rows) });
  } catch (err) {
    next(err);
  }
});

router.get('/me/orders', requireSeller, async (req, res, next) => {
  try {
    const rows = await query(`
      select oi.*, o.buyer_name, o.status, o.created_at
      from order_items oi
      join orders o on oi.order_id = o.id
      where oi.seller_id = $1
      order by o.created_at desc
    `, [req.sellerId]);

    const items = rows.map(row => ({
      order_created_at: row.created_at,
      name_snapshot: row.name_snapshot,
      buyer_name: row.buyer_name || '—',
      qty: Number(row.qty || 0),
      price_kobo_snapshot: Number(row.price_kobo_snapshot || 0),
      status: row.status || 'pending',
      order_id: row.order_id,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
