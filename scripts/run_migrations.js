const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log('No DATABASE_URL found — skipping Postgres migrations.');
    return;
  }
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      console.log('Running', f);
      await pool.query(sql);
    }
    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration error', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
