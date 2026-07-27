process.env.DB_PATH = ':memory:';
process.env.ADMIN_SECRET = 'testsecret';

const request = require('supertest');
const app = require('../server');
const db = require('../db');

describe('Reviews API', () => {
  test('submit review then approve and see in public list', async () => {
    const reviewText = 'This is an automated test review that should be long enough.';

    const postRes = await request(app)
      .post('/api/reviews')
      .send({ name: 'Tester', role: 'Tester', text: reviewText, rating: 5 })
      .set('Accept', 'application/json');

    expect(postRes.status).toBe(201);

    const rows = await db.query('SELECT id, approved, text FROM reviews ORDER BY created_at DESC LIMIT 1');
    expect(rows.length).toBe(1);
    const rev = rows[0];
    expect(rev.approved === 0 || rev.approved === '0').toBeTruthy();
    expect(rev.text).toContain('automated test review');

    // Approve via admin endpoint
    const approveRes = await request(app)
      .post(`/api/reviews/${rev.id}/approve`)
      .set('X-Admin-Secret', 'testsecret')
      .send();
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.ok).toBeTruthy();

    // Now public list should include the approved review
    const publicRes = await request(app).get('/api/reviews');
    expect(publicRes.status).toBe(200);
    const reviews = publicRes.body.reviews || [];
    expect(reviews.find(r => r.id === rev.id)).toBeTruthy();
  }, 20000);
});
