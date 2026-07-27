const { getSupabaseClient } = require('../lib/supabase');
const { query, run, getOne } = require('../db');

function normalizeProductRecord(row) {
  if (!row) return null;
  return {
    ...row,
    active: row.active === 1 || row.active === true || row.active === '1',
  };
}

async function readWithSupabase(operation, fallback) {
  const client = getSupabaseClient();
  if (!client) return fallback();

  try {
    return await operation(client);
  } catch (error) {
    console.warn('Supabase product store error, falling back to local DB:', error.message);
    return fallback();
  }
}

async function getSellerById(sellerId) {
  const fallback = async () => getOne(
    `SELECT id, store_name, accent_color FROM sellers WHERE id = $1`,
    [sellerId]
  );

  return readWithSupabase(async (client) => {
    const { data, error } = await client
      .from('sellers')
      .select('id, store_name, accent_color')
      .eq('id', sellerId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }, fallback);
}

async function attachSellerMetadata(rows) {
  const items = await Promise.all((rows || []).map(async (row) => {
    const seller = await getSellerById(row.seller_id);
    return {
      ...row,
      store_name: seller?.store_name || row.store_name || null,
      accent_color: seller?.accent_color || row.accent_color || null,
    };
  }));
  return items;
}

async function listProducts({ category, search } = {}) {
  const fallback = async () => {
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
    return (rows || []).map(normalizeProductRecord);
  };

  return readWithSupabase(async (client) => {
    let queryBuilder = client.from('products').select('*').order('created_at', { ascending: false });
    const { data, error } = await queryBuilder;
    if (error) throw error;

    let rows = (data || [])
      .filter((row) => row.active === true || row.active === 1 || row.active === '1')
      .map(normalizeProductRecord);

    if (category && category !== 'all') {
      rows = rows.filter((row) => row.category === category);
    }

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((row) => {
        const haystack = [
          row.name || '',
          row.description || '',
          row.category || '',
        ].join(' ').toLowerCase();
        return haystack.includes(term);
      });
    }

    return attachSellerMetadata(rows);
  }, fallback);
}

async function getProductById(id) {
  const fallback = async () => {
    const row = await getOne(
      `SELECT p.*, s.store_name, s.accent_color FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.id = $1`,
      [id]
    );
    return normalizeProductRecord(row);
  };

  return readWithSupabase(async (client) => {
    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = normalizeProductRecord(data);
    const seller = await getSellerById(row.seller_id);
    return {
      ...row,
      store_name: seller?.store_name || row.store_name || null,
      accent_color: seller?.accent_color || row.accent_color || null,
    };
  }, fallback);
}

async function createProduct({ id, sellerId, name, category, priceKobo, imageUrl, description, stock }) {
  const fallback = async () => {
    const existingSeller = await getOne(`SELECT id FROM sellers WHERE id = $1`, [sellerId]);
    if (!existingSeller) {
      await run(
        `INSERT INTO sellers (id, business_name, owner_name, email, password_hash, store_name, verified) VALUES ($1, $2, $3, $4, $5, $6, 1)`,
        [sellerId, 'Imported Seller', 'Imported Seller', `${sellerId}@local.invalid`, 'local-fallback', sellerId]
      );
    }

    await run(
      `INSERT INTO products (id, seller_id, name, category, price_kobo, image_url, description, stock, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
      [id, sellerId, name, category, priceKobo, imageUrl || null, description || null, stock ?? 0]
    );
    const row = await getOne(`SELECT * FROM products WHERE id = $1`, [id]);
    return normalizeProductRecord(row);
  };

  return readWithSupabase(async (client) => {
    const { data, error } = await client.from('products').insert({
      id,
      seller_id: sellerId,
      name,
      category,
      price_kobo: priceKobo,
      image_url: imageUrl || null,
      description: description || null,
      stock: stock ?? 0,
      active: true,
    }).select('*').single();
    if (error) throw error;
    return normalizeProductRecord(data);
  }, fallback);
}

async function updateProduct(id, updates) {
  const fallback = async () => {
    const fields = [];
    const values = [];

    if (updates.name != null) {
      fields.push('name = $1'); values.push(updates.name);
    }
    if (updates.category != null) {
      fields.push(`category = $${values.length + 1}`); values.push(updates.category);
    }
    if (updates.priceKobo != null) {
      fields.push(`price_kobo = $${values.length + 1}`); values.push(updates.priceKobo);
    }
    if (updates.imageUrl != null) {
      fields.push(`image_url = $${values.length + 1}`); values.push(updates.imageUrl);
    }
    if (updates.description != null) {
      fields.push(`description = $${values.length + 1}`); values.push(updates.description);
    }
    if (updates.stock != null) {
      fields.push(`stock = $${values.length + 1}`); values.push(updates.stock);
    }
    if (updates.active != null) {
      fields.push(`active = $${values.length + 1}`); values.push(updates.active ? 1 : 0);
    }

    if (fields.length === 0) {
      return normalizeProductRecord(await getOne(`SELECT * FROM products WHERE id = $1`, [id]));
    }

    values.push(id);
    await run(`UPDATE products SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    const row = await getOne(`SELECT * FROM products WHERE id = $1`, [id]);
    return normalizeProductRecord(row);
  };

  return readWithSupabase(async (client) => {
    const patch = {};
    if (updates.name != null) patch.name = updates.name;
    if (updates.category != null) patch.category = updates.category;
    if (updates.priceKobo != null) patch.price_kobo = updates.priceKobo;
    if (updates.imageUrl != null) patch.image_url = updates.imageUrl;
    if (updates.description != null) patch.description = updates.description;
    if (updates.stock != null) patch.stock = updates.stock;
    if (updates.active != null) patch.active = updates.active;

    const { data, error } = await client.from('products').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return normalizeProductRecord(data);
  }, fallback);
}

async function deleteProduct(id) {
  const fallback = async () => {
    await run(`DELETE FROM products WHERE id = $1`, [id]);
    return true;
  };

  return readWithSupabase(async (client) => {
    const { error } = await client.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  }, fallback);
}

async function listSellerProducts(sellerId) {
  const fallback = async () => {
    const rows = await query(
      `SELECT id, seller_id, name, category, price_kobo, image_url, description, stock, active, created_at FROM products WHERE seller_id = $1 ORDER BY created_at DESC`,
      [sellerId]
    );
    return (rows || []).map(normalizeProductRecord);
  };

  return readWithSupabase(async (client) => {
    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeProductRecord);
  }, fallback);
}

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  listSellerProducts,
};
