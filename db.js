const path = require('path');
const { config } = require('dotenv');
config();

const { Pool } = require('pg');
const Database = require('better-sqlite3');

let pool;
let sqliteDb;

function normalizeSql(sql, params) {
  const normalized = sql.replace(/\$(\d+)/g, '?');
  return { sql: normalized, params };
}

function initializeSqlite() {
  if (sqliteDb) return sqliteDb;

  const dbPath = process.env.DB_PATH || path.join(__dirname, 'nolerstores.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  sqliteDb.exec(`
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
      created_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      text TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      approved INTEGER DEFAULT 0,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_actions (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor TEXT,
      actor_ip TEXT,
      reason TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      starts_at TEXT,
      ends_at TEXT,
      image_url TEXT,
      cta_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_actions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor TEXT,
      actor_ip TEXT,
      reason TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure columns exist if the table was created earlier without them.
  try {
    sqliteDb.exec(`ALTER TABLE reviews ADD COLUMN ip TEXT;`);
  } catch (err) { /* ignore if column exists or table missing */ }
  try {
    sqliteDb.exec(`ALTER TABLE reviews ADD COLUMN user_agent TEXT;`);
  } catch (err) { /* ignore if column exists or table missing */ }
  try {
    sqliteDb.exec(`ALTER TABLE campaigns ADD COLUMN image_url TEXT;`);
  } catch (err) { /* ignore if column exists or table missing */ }
  try {
    sqliteDb.exec(`ALTER TABLE campaigns ADD COLUMN cta_url TEXT;`);
  } catch (err) { /* ignore if column exists or table missing */ }

  return sqliteDb;
}

function getDb() {
  if (pool) return { kind: 'pg', pool };

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_URL;
  if (connectionString && connectionString.includes('postgres')) {
    pool = new Pool({
      connectionString,
      ssl: process.env.SUPABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    });
    return { kind: 'pg', pool };
  }

  return { kind: 'sqlite', db: initializeSqlite() };
}

async function query(sql, params = []) {
  const db = getDb();
  if (db.kind === 'pg') {
    const result = await db.pool.query(sql, params);
    return result.rows;
  }

  const { sql: normalizedSql, params: normalizedParams } = normalizeSql(sql, params);
  const stmt = db.db.prepare(normalizedSql);
  const isSelect = /^select|^with/i.test(normalizedSql.trim());
  if (isSelect) {
    return stmt.all(...normalizedParams);
  }
  const result = stmt.run(...normalizedParams);
  return [{ rowCount: result.changes, insertId: result.lastInsertRowid }];
}

async function run(sql, params = []) {
  const db = getDb();
  if (db.kind === 'pg') {
    const result = await db.pool.query(sql, params);
    return { rowCount: result.rowCount, rows: result.rows };
  }

  const { sql: normalizedSql, params: normalizedParams } = normalizeSql(sql, params);
  const stmt = db.db.prepare(normalizedSql);
  const result = stmt.run(...normalizedParams);
  return { rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function transaction(callback) {
  const db = getDb();

  if (db.kind === 'pg') {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: (sqlText, sqlParams = []) => client.query(sqlText, sqlParams),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  db.db.exec('BEGIN');
  try {
    const result = await callback({
      query: async (sqlText, sqlParams = []) => {
        const { sql: normalizedSql, params: normalizedParams } = normalizeSql(sqlText, sqlParams);
        const stmt = db.db.prepare(normalizedSql);
        const isSelect = /^select|^with/i.test(normalizedSql.trim());
        if (isSelect) {
          return { rows: stmt.all(...normalizedParams) };
        }
        const execution = stmt.run(...normalizedParams);
        return { rows: [], rowCount: execution.changes };
      },
    });
    db.db.exec('COMMIT');
    return result;
  } catch (error) {
    db.db.exec('ROLLBACK');
    throw error;
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  query,
  run,
  getOne,
  transaction,
  close,
};
