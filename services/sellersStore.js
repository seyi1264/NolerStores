const { getOne, query } = require('../db');

async function getSellerById(sellerId) {
  return await getOne(`SELECT id, business_name, owner_name, email, phone, store_name, category, bio, accent_color, bank_name, account_number, account_name, verified, created_at FROM sellers WHERE id = $1`, [sellerId]);
}

async function getSellerDashboard(sellerId) {
  const seller = await getOne(`SELECT id, store_name, accent_color FROM sellers WHERE id = $1`, [sellerId]);
  const productsCount = await getOne(`SELECT COUNT(*) AS count FROM products WHERE seller_id = $1`, [sellerId]);
  const orders = await query(`SELECT o.*, oi.product_id, oi.name_snapshot, oi.qty, oi.price_kobo_snapshot FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.seller_id = $1 ORDER BY o.created_at DESC`, [sellerId]);
  return { seller, productsCount: productsCount?.count || 0, orders };
}

module.exports = { getSellerById, getSellerDashboard };
