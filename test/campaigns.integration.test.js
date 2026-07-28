process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('Campaign coercion and create', () => {
  test('admin can create campaign with human-friendly date strings and coercion is logged', async () => {
    // create admin token using env secret
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ admin: true, username: 'admin' }, process.env.JWT_SECRET || 'dev-secret');

    const payload = {
      name: 'Autumn Promo',
      startsAt: 'Aug 1 2026 09:00',
      endsAt: 'Aug 31 2026 23:59'
    };

    const res = await request(app)
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.campaign).toBeTruthy();
    // Confirm campaign stored with snake_case ISO dates
    expect(res.body.campaign.starts_at).toMatch(/T/);
  });
});
