const express = require('express');
const { query, transaction } = require('../db');
const { v4 } = require('uuid');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { buyerName, buyerEmail, buyerPhone, deliveryAddress, items } = req.body || {};

    if (!buyerName || !buyerEmail || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Buyer details and cart items are required.' });
    }

    const lineItems = items.map((item) => ({
      productId: item.productId,
      qty: Math.max(1, Number(item.qty) || 1),
    }));

    const productIds = lineItems.map((item) => item.productId);
    if (productIds.some((id) => !id)) {
      return res.status(400).json({ error: 'Each cart item must include a productId.' });
    }

    const placeholders = productIds.map((_, index) => `$${index + 1}`).join(',');

    const result = await transaction(async (tx) => {
      const productQuery = await tx.query(`select * from products where active = 1 and id in (${placeholders})`, productIds);
      const products = productQuery.rows || [];

      if (products.length !== productIds.length) {
        return { error: 'One or more products are unavailable.' };
      }

      const orderId = v4();
      const createdAt = new Date().toISOString();
      const subtotalKobo = products.reduce((sum, product) => {
        const item = lineItems.find((line) => line.productId === product.id);
        if (!item) return sum;
        return sum + Number(product.price_kobo || 0) * item.qty;
      }, 0);

      await tx.query(
        'insert into orders (id, buyer_name, buyer_email, buyer_phone, delivery_address, subtotal_kobo, status, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [orderId, buyerName, buyerEmail, buyerPhone || null, deliveryAddress || null, subtotalKobo, 'pending', createdAt]
      );

      for (const item of lineItems) {
        const product = products.find((productRow) => productRow.id === item.productId);
        if (!product) continue;
        await tx.query(
          'insert into order_items (id, order_id, product_id, seller_id, name_snapshot, qty, price_kobo_snapshot) values ($1, $2, $3, $4, $5, $6, $7)',
          [v4(), orderId, product.id, product.seller_id, product.name, item.qty, product.price_kobo]
        );
      }

      return {
        order: {
          id: orderId,
          buyerName,
          buyerEmail,
          buyerPhone: buyerPhone || null,
          deliveryAddress: deliveryAddress || null,
          subtotalKobo,
          status: 'pending',
          createdAt,
        },
      };
    });

    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ order: result.order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
