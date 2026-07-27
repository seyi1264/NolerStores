const express = require('express');
const { v4: uuid } = require('uuid');
const { getOne, query, run, transaction } = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
  const { buyerName, buyerEmail, buyerPhone, deliveryAddress, items } = req.body;
  if (!buyerName || !buyerEmail || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'buyerName, buyerEmail and at least one item are required' });
  }

  const resolvedItems = [];
  let subtotalKobo = 0;

  for (const it of items) {
    const product = await getOne(`SELECT * FROM products WHERE id = $1 AND active = 1`, [it.productId]);
    if (!product) return res.status(400).json({ error: `Product ${it.productId} not found` });
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    subtotalKobo += product.price_kobo * qty;
    resolvedItems.push({ product, qty });
  }

  const orderId = uuid();

  await transaction(async ({ query: txQuery }) => {
    await txQuery(
      `INSERT INTO orders (id, buyer_name, buyer_email, buyer_phone, delivery_address, subtotal_kobo, status) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [orderId, buyerName, buyerEmail, buyerPhone || null, deliveryAddress || null, subtotalKobo]
    );
    for (const { product, qty } of resolvedItems) {
      await txQuery(
        `INSERT INTO order_items (id, order_id, product_id, seller_id, name_snapshot, qty, price_kobo_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuid(), orderId, product.id, product.seller_id, product.name, qty, product.price_kobo]
      );
    }
  });

  res.status(201).json({
    orderId,
    subtotalKobo,
    subtotalNaira: subtotalKobo / 100,
  });
});

router.get('/:id', async (req, res) => {
  const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
  res.json({ order, items });
});

module.exports = router;
