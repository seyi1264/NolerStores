const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { getOne, query, run } = require('../db');
const { requireSeller } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

router.post('/upload-image', requireSeller, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

router.get('/', async (req, res) => {
  const { category, search } = req.query;
  const params = [];

  let where = 'WHERE p.active = 1';
  if (category && category !== 'all') {
    params.push(category);
    where += ` AND p.category = $${params.length}`;
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term, term, term, term);
    where += ` AND (
      lower(p.name) LIKE $${params.length - 3}
      OR lower(p.description) LIKE $${params.length - 2}
      OR lower(p.category) LIKE $${params.length - 1}
      OR lower(s.store_name) LIKE $${params.length}
    )`;
  }

  const sql = `SELECT p.*, s.store_name, s.accent_color FROM products p JOIN sellers s ON s.id = p.seller_id ${where} ORDER BY p.created_at DESC`;
  const rows = await query(sql, params);
  res.json({ products: rows });
});

router.get('/:id', async (req, res) => {
  const product = await getOne(
    `SELECT p.*, s.store_name, s.accent_color FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
});

router.post('/', requireSeller, async (req, res) => {
  const { name, category, priceNaira, imageUrl, description, stock } = req.body;
  if (!name || !category || !priceNaira) {
    return res.status(400).json({ error: 'name, category and priceNaira are required' });
  }

  const id = uuid();
  await run(
    `INSERT INTO products (id, seller_id, name, category, price_kobo, image_url, description, stock, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
    [id, req.sellerId, name, category, Math.round(priceNaira * 100), imageUrl || null, description || null, stock ?? 0]
  );
  const product = await getOne(`SELECT * FROM products WHERE id = $1`, [id]);
  res.status(201).json({ product });
});

router.put('/:id', requireSeller, async (req, res) => {
  const existing = await getOne(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.seller_id !== req.sellerId) return res.status(403).json({ error: 'Not your product' });

  const { name, category, priceNaira, imageUrl, description, stock, active } = req.body;
  await run(
    `UPDATE products SET name = COALESCE($1, name), category = COALESCE($2, category), price_kobo = COALESCE($3, price_kobo), image_url = COALESCE($4, image_url), description = COALESCE($5, description), stock = COALESCE($6, stock), active = COALESCE($7, active) WHERE id = $8`,
    [
      name ?? null,
      category ?? null,
      priceNaira != null ? Math.round(priceNaira * 100) : null,
      imageUrl ?? null,
      description ?? null,
      stock ?? null,
      active != null ? (active ? 1 : 0) : null,
      req.params.id,
    ]
  );
  const product = await getOne(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
  res.json({ product });
});

router.delete('/:id', requireSeller, async (req, res) => {
  const existing = await getOne(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.seller_id !== req.sellerId) return res.status(403).json({ error: 'Not your product' });
  await run(`DELETE FROM products WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
