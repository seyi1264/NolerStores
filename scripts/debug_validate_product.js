const { validateBody } = require('../middleware/validate');

function makeReq(body) {
  return { body };
}

function makeRes() {
  return {
    status(code) { this._status = code; return this; },
    json(obj) { this._json = obj; return this; }
  };
}

function runTest(payload) {
  return new Promise((resolve) => {
    const req = makeReq(payload);
    const res = makeRes();
    const next = () => resolve({ ok: true, body: req.body });
    const validator = validateBody('product-create');
    try {
      const maybe = validator(req, res, next);
      // If middleware returned a promise, wait
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(() => resolve({ ok: true, body: req.body })).catch((err) => resolve({ ok: false, err: String(err), res }));
      } else {
        // short delay to allow sync path
        setTimeout(() => resolve({ ok: true, body: req.body, res }), 50);
      }
    } catch (err) {
      resolve({ ok: false, err: String(err) });
    }
  });
}

async function main(){
  const tests = [
    { name: 'Indigo Dress', category: 'fashion', price: 24500, stock: 12, imageUrl: 'https://example.com/img.jpg' },
    { name: '', category: 'fashion', price: 24500 },
    { name: 'NoPrice', category: 'fashion' },
    // possible client payload where price is string with comma
    { name: 'CommaPrice', category: 'fashion', price: '24,500' },
    // price as NaN
    { name: 'BadPrice', category: 'fashion', price: NaN },
  ];

  // Also simulate front-end sanitized payload where price input was '24,500'
  const raw = { name: 'CommaPriceFrontend', category: 'fashion', priceRaw: '24,500' };
  const sanitizedPrice = raw.priceRaw.replace(/[,\s]/g, '');
  const frontendPayload = { name: raw.name, category: raw.category, price: parseFloat(sanitizedPrice) };
  tests.push(frontendPayload);

  for (const p of tests) {
    console.log('\n=== Testing payload:', p);
    const result = await runTest(p);
    if (result.res && result.res._json) {
      console.log('Response:', result.res._status, JSON.stringify(result.res._json, null, 2));
    } else if (result.ok) {
      console.log('Validator passed. Normalized body:', result.body);
    } else {
      console.log('Error:', result.err);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
