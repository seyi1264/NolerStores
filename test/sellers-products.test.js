process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('Seller product flow', () => {
  test('allows browser requests from the deployed frontend origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://nolerstores-xwlgba.fly.dev');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://nolerstores-xwlgba.fly.dev');
  });

  test('seller can create a product and see it in their dashboard and the public catalog', async () => {
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
      .send({
        name: 'Test product',
        category: 'fashion',
        priceNaira: 2500,
        stock: 4,
        description: 'A test product',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.product).toBeTruthy();

    const myProductsRes = await request(app)
      .get('/api/sellers/me/products')
      .set('Authorization', `Bearer ${token}`);

    expect(myProductsRes.status).toBe(200);
    expect(myProductsRes.body.products.some((product) => product.id === createRes.body.product.id)).toBeTruthy();

    const publicProductsRes = await request(app).get('/api/products');
    expect(publicProductsRes.status).toBe(200);
    expect(publicProductsRes.body.products.some((product) => product.id === createRes.body.product.id)).toBeTruthy();
  }, 20000);
});
