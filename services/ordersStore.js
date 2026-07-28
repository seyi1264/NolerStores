const { v4: uuid } = require('uuid');
const { getOne, query, run, transaction } = require('../db');

async function createOrder({ buyerName, buyerEmail, buyerPhone, deliveryAddress, items }) {
  const resolvedItems = [];
  let subtotalKobo = 0;

  for (const it of items) {
    const product = await getOne(`SELECT * FROM products WHERE id = $1 AND active = 1`, [it.productId]);
    if (!product) throw new Error(`Product ${it.productId} not found`);
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

  const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const itemsRows = await query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
  return { order, items: itemsRows };
}

async function getOrderById(id) {
  const order = await getOne(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (!order) return null;
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [id]);
  return { order, items };
}

async function getOrderItems(orderId) {
  return await query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
}

async function listOrdersBySeller(sellerId) {
  const rows = await query(`SELECT o.*, oi.product_id, oi.name_snapshot, oi.qty, oi.price_kobo_snapshot FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.seller_id = $1 ORDER BY o.created_at DESC`, [sellerId]);
  return rows;
}

module.exports = { createOrder, getOrderById, getOrderItems, listOrdersBySeller };
