const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getOne } = require('../db');
const { shapeSeller } = require('../middleware/response');
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

module.exports = router;
