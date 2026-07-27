/*
Migration script: convert stored image paths (products.image_url and campaigns.image_url)
to absolute URLs using API_BASE or request host fallback.

Usage:
  API_BASE=https://nolerstores-xwlgba.fly.dev node scripts/migrate_image_urls.js
*/

const db = require('../db');

const BASE = process.env.API_BASE || (process.env.NODE_ENV === 'production' ? 'https://nolerstores-xwlgba.fly.dev' : 'http://localhost:4000');

function makeAbsolute(url){
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!url.startsWith('/')) url = '/' + url;
  return BASE + url;
}

async function migrate(){
  console.log('Using base URL:', BASE);
  let updated = 0;
  await db.transaction(async (tx) => {
    // Products
    const prodRows = await tx.query('SELECT id, image_url FROM products WHERE image_url IS NOT NULL');
    for (const r of prodRows.rows || prodRows){
      const cur = r.image_url;
      const abs = makeAbsolute(cur);
      if (abs && abs !== cur){
        await tx.query('UPDATE products SET image_url = $1 WHERE id = $2', [abs, r.id]);
        updated++;
        console.log('Updated product', r.id, cur, '->', abs);
      }
    }

    // Campaigns
    const campRows = await tx.query('SELECT id, image_url FROM campaigns WHERE image_url IS NOT NULL');
    for (const r of campRows.rows || campRows){
      const cur = r.image_url;
      const abs = makeAbsolute(cur);
      if (abs && abs !== cur){
        await tx.query('UPDATE campaigns SET image_url = $1 WHERE id = $2', [abs, r.id]);
        updated++;
        console.log('Updated campaign', r.id, cur, '->', abs);
      }
    }
  });

  console.log('Migration complete. Updated rows:', updated);
  await db.close();
}

migrate().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
