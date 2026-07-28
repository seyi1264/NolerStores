function toBoolean(value) {
  return value === 1 || value === '1' || value === true;
}

function shapeProduct(row) {
  if (!row) return null;

  const id = row.id || row.product_id;
  const seller_id = row.seller_id || row.sellerId;
  const price_kobo = row.price_kobo || row.priceKobo || Math.round((row.price || 0) * 100);

  return {
    id: id,
    sellerId: seller_id,
    name: row.name,
    category: row.category,
    price: (price_kobo == null) ? null : Number((price_kobo / 100).toFixed(2)),
    priceKobo: price_kobo,
    imageUrl: row.image_url || row.imageUrl || null,
    description: row.description || null,
    stock: row.stock != null ? Number(row.stock) : 0,
    active: toBoolean(row.active),
    createdAt: row.created_at || row.createdAt || null,
    storeName: row.store_name || row.storeName || null,
    accentColor: row.accent_color || row.accentColor || null,
  };
}

function shapeProducts(rows) {
  return (rows || []).map(shapeProduct);
}

function shapeSeller(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessName: row.business_name || row.businessName,
    ownerName: row.owner_name || row.ownerName,
    email: row.email,
    phone: row.phone || null,
    storeName: row.store_name || row.storeName,
    category: row.category || null,
    bio: row.bio || null,
    accentColor: row.accent_color || row.accentColor || null,
    bankName: row.bank_name || row.bankName || null,
    accountNumber: row.account_number || row.accountNumber || null,
    accountName: row.account_name || row.accountName || null,
    verified: toBoolean(row.verified),
    createdAt: row.created_at || row.createdAt || null,
  };
}

function shapeOrderItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id || row.productId,
    sellerId: row.seller_id || row.sellerId,
    nameSnapshot: row.name_snapshot || row.nameSnapshot,
    qty: Number(row.qty || 0),
    price: row.price_kobo_snapshot != null ? Number((row.price_kobo_snapshot / 100).toFixed(2)) : null,
    priceKoboSnapshot: row.price_kobo_snapshot || row.priceKoboSnapshot || null,
  };
}

function shapeOrder(row, items) {
  if (!row) return null;
  const order = {
    id: row.id,
    buyerName: row.buyer_name || row.buyerName,
    buyerEmail: row.buyer_email || row.buyerEmail,
    buyerPhone: row.buyer_phone || row.buyerPhone || null,
    deliveryAddress: row.delivery_address || row.deliveryAddress || null,
    subtotalKobo: row.subtotal_kobo || row.subtotalKobo || null,
    subtotal: (row.subtotal_kobo || row.subtotalKobo) ? Number(((row.subtotal_kobo || row.subtotalKobo) / 100).toFixed(2)) : null,
    status: row.status,
    paymentProvider: row.payment_provider || row.paymentProvider || null,
    paymentReference: row.payment_reference || row.paymentReference || null,
    createdAt: row.created_at || row.createdAt || null,
    items: (items || []).map(shapeOrderItem),
  };
  return order;
}

module.exports = { shapeProduct, shapeProducts, shapeSeller, shapeOrder, shapeOrderItem };
