// db.js — SQLite connection + schema bootstrap for NolerStores
// Swap this file for a Postgres pool (pg) with the same query shapes if you
// outgrow single-file SQLite; every route only talks to the functions below.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'nolerstores.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  store_name TEXT NOT NULL,
  category TEXT,
  bio TEXT,
  accent_color TEXT DEFAULT '#a63a2c',
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_kobo INTEGER NOT NULL,       -- store in kobo (₦1 = 100 kobo) to avoid float errors
  image_url TEXT,                    -- nullable: frontend falls back to gradient tile
  description TEXT,
  stock INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  delivery_address TEXT,
  subtotal_kobo INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',     -- pending | paid | failed | shipped | completed
  payment_provider TEXT,
  payment_reference TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  seller_id TEXT NOT NULL REFERENCES sellers(id),
  name_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price_kobo_snapshot INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);
`);

module.exports = db;
