const { validateBody } = require('../middleware/validate');

function makeReq(body) { return { body }; }
function makeRes() { return { status(code) { this._status = code; return this; }, json(obj) { this._json = obj; return this; } }; }

function runTest(payload) {
  return new Promise((resolve) => {
    const req = makeReq(payload);
    const res = makeRes();
    const next = () => resolve({ ok: true, body: req.body });
    const validator = validateBody('campaign-create');
    try {
      const maybe = validator(req, res, next);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(() => resolve({ ok: true, body: req.body })).catch((err) => resolve({ ok: false, err: String(err), res }));
      } else {
        setTimeout(() => resolve({ ok: true, body: req.body, res }), 20);
      }
    } catch (err) { resolve({ ok: false, err: String(err) }); }
  });
}

async function main(){
  const tests = [
    { name: 'Summer sale', startsAt: '2026-08-01T09:00:00+01:00', endsAt: '2026-08-31T23:59:59Z' },
    { name: 'Human date', startsAt: 'Aug 1 2026 09:00', endsAt: 'Aug 31 2026 23:59' },
    { name: 'Epoch', startsAt: Date.now() },
    { name: 'Bad date', startsAt: 'not-a-date' },
    { name: 'Null ends', startsAt: '2026-08-01', endsAt: null },
  ];

  for (const p of tests) {
    console.log('\n=== Testing campaign payload:', p);
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
