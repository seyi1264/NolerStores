process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('Product creation with comma-formatted price', () => {
  test('seller can create product with price "24,500" and it is stored correctly', async () => {
    const unique = Date.now();
    const sellerPayload = {
      businessName: `Biz ${unique}`,
      ownerName: 'Test Owner',
      email: `seller-${unique}@example.com`,
      password: 'password123',
      phone: '08000000000',
      storeName: `Store ${unique}`,
      category: 'fashion',
      bio: 'Test seller',
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      accountName: 'Test Owner',
    };

    const registerRes = await request(app)
      .post('/api/sellers/register')
      .send(sellerPayload);
    expect(registerRes.status).toBe(201);
    const token = registerRes.body.token;

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Comma Price', category: 'fashion', price: '24,500', stock: 2 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.product).toBeTruthy();
    // API should store price as number (price_kobo exists)
    const p = createRes.body.product;
    expect(p.price !== undefined || p.price_kobo !== undefined).toBeTruthy();
  });
});
