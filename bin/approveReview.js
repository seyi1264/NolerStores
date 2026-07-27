#!/usr/bin/env node
const fetch = require('node-fetch');

const id = process.argv[2];
if (!id) {
  console.error('Usage: node bin/approveReview.js <review-id>');
  process.exit(2);
}
const base = process.env.API_BASE || 'http://localhost:4000';
const adminSecret = process.env.ADMIN_SECRET;
if (!adminSecret) {
  console.error('ADMIN_SECRET environment variable must be set');
  process.exit(2);
}

async function run() {
  const url = `${base}/api/reviews/${id}/approve`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-Admin-Secret': adminSecret } });
  const txt = await res.text();
  console.log(res.status, txt);
}

run().catch(e => { console.error(e); process.exit(1); });
