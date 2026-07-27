-- Migrations for Postgres
CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  store_name TEXT UNIQUE NOT NULL,
  category TEXT,
  bio TEXT,
  accent_color TEXT DEFAULT '#a63a2c',
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  verified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_kobo INTEGER NOT NULL,
  image_url TEXT,
  description TEXT,
  stock INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  delivery_address TEXT,
  subtotal_kobo INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_provider TEXT,
  payment_reference TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  text TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  approved INTEGER DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_actions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  actor_ip TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_actions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  actor_ip TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
