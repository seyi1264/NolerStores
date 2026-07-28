const express = require('express');
const { createOrder, getOrderById } = require('../services/ordersStore');
const { shapeOrder } = require('../middleware/response');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { buyerName, buyerEmail, buyerPhone, deliveryAddress, items } = req.body;
    if (!buyerName || !buyerEmail || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'buyerName, buyerEmail and at least one item are required' });
    }

    const { order, items: createdItems } = await createOrder({ buyerName, buyerEmail, buyerPhone, deliveryAddress, items });
    res.status(201).json({ order: shapeOrder(order, createdItems) });
  } catch (err) {
    if (/not found/i.test(err.message)) return res.status(400).json({ error: err.message });
    console.error('Failed to create order', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

router.get('/:id', async (req, res) => {
  const result = await getOrderById(req.params.id);
  if (!result) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: shapeOrder(result.order, result.items) });
});

module.exports = router;
