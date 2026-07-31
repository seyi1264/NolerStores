const express = require('express');
const { query } = require('../db');
const { shapeProducts } = require('../middleware/response');

const router = express.Router();

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

module.exports = router;
