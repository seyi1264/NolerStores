const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { shapeProducts } = require('../middleware/response');
const { requireSeller } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

async function ensureSellerExists(sellerId) {
  const existing = await query('select id from sellers where id = $1', [sellerId]);
  if (existing.length) return;

  const createdAt = new Date().toISOString();
  await query(
    'insert into sellers (id, business_name, owner_name, email, password_hash, store_name, verified, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      sellerId,
      'Imported Seller',
      'Imported Seller',
      `${sellerId}@local.invalid`,
      'local-fallback',
      sellerId,
      1,
      createdAt,
    ]
  );
}

function normalizeProductPayload(body) {
  const payload = {};
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.category !== undefined) payload.category = String(body.category).trim();
  if (body.description !== undefined) payload.description = String(body.description).trim();
  if (body.imageUrl !== undefined) payload.image_url = body.imageUrl || null;

  if (body.price !== undefined && body.price !== null && body.price !== '') {
    const rawPrice = typeof body.price === 'string' ? body.price.replace(/,/g, '').trim() : body.price;
    const price = Number(rawPrice);
    if (!Number.isFinite(price)) {
      payload.invalidPrice = true;
    } else {
      payload.price_kobo = Math.round(price * 100);
    }
  } else if (body.price_kobo !== undefined && body.price_kobo !== null && body.price_kobo !== '') {
    const priceKobo = Number(body.price_kobo);
    if (!Number.isFinite(priceKobo)) {
      payload.invalidPrice = true;
    } else {
      payload.price_kobo = Math.round(priceKobo);
    }
  }

  if (body.stock !== undefined) {
    const stockValue = Number(body.stock);
    payload.stock = Number.isFinite(stockValue) ? Math.max(0, Math.round(stockValue)) : 0;
  }
  if (body.active !== undefined) payload.active = body.active === true || body.active === '1' || body.active === 1 || body.active === 'true';
  return payload;
}

router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    let sql = `select p.*, s.store_name from products p left join sellers s on p.seller_id = s.id where p.active = 1`;
    const params = [];

    if (category) {
      params.push(category);
      sql += ` and p.category = $${params.length}`;
    }

    if (search) {
      const term = `%${String(search).trim().toLowerCase()}%`;
      const searchIndex = params.length + 1;
      params.push(term, term, term, term);
      sql += ` and (lower(p.name) like $${searchIndex} or lower(p.description) like $${searchIndex + 1} or lower(s.store_name) like $${searchIndex + 2} or lower(p.category) like $${searchIndex + 3})`;
    }

    sql += ' order by p.created_at desc';
    const rows = await query(sql, params);
    res.json({ products: shapeProducts(rows) });
  } catch (err) {
    next(err);
  }
});

router.post('/upload-image', requireSeller, upload.single('image'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image was uploaded.' });
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const finalName = `${Date.now()}-${file.filename}${ext}`;
    const finalPath = path.join(uploadsDir, finalName);
    fs.renameSync(file.path, finalPath);

    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ imageUrl: `${baseUrl}/uploads/${finalName}` });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireSeller, async (req, res, next) => {
  try {
    const payload = normalizeProductPayload(req.body);
    if (payload.invalidPrice) {
      return res.status(400).json({ error: 'Product price must be a valid number.' });
    }
    if (!payload.name || !payload.category || payload.price_kobo == null) {
      return res.status(400).json({ error: 'Product name, category, and price are required.' });
    }

    const productId = require('uuid').v4();
    const createdAt = new Date().toISOString();

    await ensureSellerExists(req.sellerId);

    await query(
      `insert into products (id, seller_id, name, category, price_kobo, image_url, description, stock, active, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        productId,
        req.sellerId,
        payload.name,
        payload.category,
        payload.price_kobo,
        payload.image_url || null,
        payload.description || null,
        payload.stock || 0,
        payload.active !== undefined ? (payload.active ? 1 : 0) : 1,
        createdAt,
      ]
    );

    const rows = await query('select * from products where id = $1', [productId]);
    res.status(201).json({ product: shapeProducts(rows)[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireSeller, async (req, res, next) => {
  try {
    const productId = req.params.id;
    const existing = await query('select * from products where id = $1 and seller_id = $2', [productId, req.sellerId]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const payload = normalizeProductPayload(req.body);
    if (payload.invalidPrice) {
      return res.status(400).json({ error: 'Product price must be a valid number.' });
    }

    const updates = [];
    const params = [];
    Object.keys(payload).forEach((key) => {
      if (key === 'invalidPrice') return;
      updates.push(`${key} = $${updates.length + 1}`);
      params.push(payload[key]);
    });

    if (!updates.length) {
      return res.status(400).json({ error: 'No product fields provided to update.' });
    }

    params.push(productId, req.sellerId);
    await query(`update products set ${updates.join(', ')} where id = $${params.length - 1} and seller_id = $${params.length}`, params);
    const rows = await query('select * from products where id = $1', [productId]);
    res.json({ product: shapeProducts(rows)[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSeller, async (req, res, next) => {
  try {
    const productId = req.params.id;
    const result = await query('delete from products where id = $1 and seller_id = $2', [productId, req.sellerId]);
    if (!result || result.length === 0) {
      // For sqlite, query returns [] for delete; still treat as deleted.
      return res.json({ ok: true });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
