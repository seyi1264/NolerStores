const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { requireSeller } = require('../middleware/auth');
const {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../services/productsStore');
const { validateBody } = require('../middleware/validate');
const { shapeProduct, shapeProducts } = require('../middleware/response');

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
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0];
  const proto = forwardedProto || req.protocol;
  let base = (process.env.API_BASE && /^https?:\/\//i.test(process.env.API_BASE)) ? process.env.API_BASE : `${proto}://${req.get('host')}`;
  if (proto === 'https' && base.startsWith('http://')) base = base.replace('http://', 'https://');
  const rel = `/uploads/${req.file.filename}`;
  const imageUrl = base + rel;
  res.json({ imageUrl });
});

router.get('/', async (req, res) => {
  const { category, search } = req.query;
  const products = await listProducts({ category, search });
  res.json({ products: shapeProducts(products) });
});

router.get('/:id', async (req, res) => {
  const product = await getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: shapeProduct(product) });
});

router.post('/', requireSeller, validateBody('product-create'), async (req, res) => {
  const { name, category, price, imageUrl, description, stock } = req.body;

  const id = uuid();
  const product = await createProduct({
    id,
    sellerId: req.sellerId,
    name,
    category,
    priceKobo: Math.round(price * 100),
    imageUrl: imageUrl || null,
    description: description || null,
    stock: stock ?? 0,
  });

  res.status(201).json({ product: shapeProduct(product) });
});

router.put('/:id', requireSeller, validateBody('product-update'), async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if ((existing.seller_id || existing.sellerId) !== req.sellerId) return res.status(403).json({ error: 'Not your product' });

  const { name, category, price, imageUrl, description, stock, active } = req.body;
  const product = await updateProduct(req.params.id, {
    name,
    category,
    priceKobo: price != null ? Math.round(price * 100) : null,
    imageUrl,
    description,
    stock,
    active,
  });

  res.json({ product: shapeProduct(product) });
});

router.delete('/:id', requireSeller, async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.seller_id !== req.sellerId) return res.status(403).json({ error: 'Not your product' });

  await deleteProduct(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
