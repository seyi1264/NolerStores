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
  const products = await listProducts({ category, search });
  res.json({ products });
});

router.get('/:id', async (req, res) => {
  const product = await getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
});

router.post('/', requireSeller, async (req, res) => {
  const { name, category, priceNaira, imageUrl, description, stock } = req.body;
  if (!name || !category || !priceNaira) {
    return res.status(400).json({ error: 'name, category and priceNaira are required' });
  }

  const id = uuid();
  const product = await createProduct({
    id,
    sellerId: req.sellerId,
    name,
    category,
    priceKobo: Math.round(priceNaira * 100),
    imageUrl: imageUrl || null,
    description: description || null,
    stock: stock ?? 0,
  });

  res.status(201).json({ product });
});

router.put('/:id', requireSeller, async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.seller_id !== req.sellerId) return res.status(403).json({ error: 'Not your product' });

  const { name, category, priceNaira, imageUrl, description, stock, active } = req.body;
  const product = await updateProduct(req.params.id, {
    name,
    category,
    priceKobo: priceNaira != null ? Math.round(priceNaira * 100) : null,
    imageUrl,
    description,
    stock,
    active,
  });

  res.json({ product });
});

router.delete('/:id', requireSeller, async (req, res) => {
  const existing = await getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.seller_id !== req.sellerId) return res.status(403).json({ error: 'Not your product' });

  await deleteProduct(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
