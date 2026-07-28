process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');

describe('Orders integration', () => {
  test('creates an order and retrieves it', async () => {
    // create a seller
    const unique = Date.now();
    const sellerPayload = {
      businessName: `Biz ${unique}`,
      ownerName: 'Seller Test',
      email: `orders-seller-${unique}@example.com`,
      password: 'password123',
      phone: '08000000000',
      storeName: `Store ${unique}`,
    };

    const reg = await request(app).post('/api/sellers/register').send(sellerPayload);
    expect(reg.status).toBe(201);
    const token = reg.body.token;

    // create a product
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Orderable Item', category: 'fashion', price: 15.00, stock: 10 });
    expect(createRes.status).toBe(201);
    const product = createRes.body.product;

    // create an order
    const orderRes = await request(app).post('/api/orders').send({
      buyerName: 'Jane Buyer', buyerEmail: 'jane@example.com', items: [{ productId: product.id, qty: 2 }]
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order).toBeTruthy();
    const orderId = orderRes.body.order.id;
    expect(orderRes.body.order.subtotal).toBeCloseTo(30.00, 2);

    // retrieve the order
    const getRes = await request(app).get(`/api/orders/${orderId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.order.id).toBe(orderId);
    expect(getRes.body.order.items.length).toBeGreaterThan(0);
  }, 20000);
});
