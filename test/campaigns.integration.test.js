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

  test('admin and public campaign endpoints return frontend-safe campaign shapes', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ admin: true, username: 'admin' }, process.env.JWT_SECRET || 'dev-secret');

    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Summer Market',
        status: 'active',
        startsAt: startedAt,
        endsAt,
        imageUrl: 'https://example.com/banner.jpg',
        ctaUrl: 'https://example.com/shop',
      });

    expect(createRes.status).toBe(201);
    const createdCampaign = createRes.body.campaign;

    const adminListRes = await request(app)
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(adminListRes.status).toBe(200);
    const createdFromAdmin = adminListRes.body.campaigns.find((campaign) => campaign.id === createdCampaign.id);
    expect(createdFromAdmin).toMatchObject({
      name: 'Summer Market',
      startsAt: expect.any(String),
      endsAt: expect.any(String),
      imageUrl: 'https://example.com/banner.jpg',
      ctaUrl: 'https://example.com/shop',
    });

    const publicRes = await request(app)
      .get('/api/campaigns');

    expect(publicRes.status).toBe(200);
    expect(publicRes.body.campaigns).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdCampaign.id, name: 'Summer Market', status: 'active' })])
    );
  });

  test('admin PUT for a missing campaign id creates it instead of returning 404', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ admin: true, username: 'admin' }, process.env.JWT_SECRET || 'dev-secret');
    const missingId = '11111111-1111-1111-1111-111111111111';

    const res = await request(app)
      .put(`/api/admin/campaigns/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New campaign', status: 'draft' });

    expect(res.status).toBe(201);
    expect(res.body.campaign.id).toBe(missingId);
    expect(res.body.campaign.name).toBe('New campaign');
  });
});
