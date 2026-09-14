import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import app from '../server.js';
import User from '../models/User.js';
import Business from '../models/Business.js';
import NfcCard from '../models/NfcCard.js';
import { Order, Product } from '../models/Order.js';
import { generateToken } from '../middleware/auth.js';

let server;
let owner;
let otherOwner;
let business;
let otherBusiness;
let card;
let order;

before(async () => {
  await connectDB();
  const suffix = Date.now().toString();
  owner = await User.create({ username: `owner${suffix}`, password: 'test123', email: `owner${suffix}@example.com`, fullName: 'Owner', role: 'business' });
  otherOwner = await User.create({ username: `other${suffix}`, password: 'test123', email: `other${suffix}@example.com`, fullName: 'Other', role: 'business' });
  business = await Business.create({ name: `Owner Business ${suffix}`, slug: `owner-business-${suffix}`, category: 'restaurant', owner: owner._id });
  otherBusiness = await Business.create({ name: `Other Business ${suffix}`, slug: `other-business-${suffix}`, category: 'restaurant', owner: otherOwner._id });
  card = await NfcCard.create({ cardId: `ownership-${suffix}`, business: business._id, destinationUrl: 'https://example.com/owner' });
  const product = await Product.findOne({ isActive: true }) || await Product.create({ name: `Test Pack ${suffix}`, slug: `test-pack-${suffix}`, price: 1, cardCount: 1 });
  order = await Order.create({
    orderNumber: `TEST-${suffix}`,
    customer: owner._id,
    business: business._id,
    items: [{ product: product._id, quantity: 1, price: product.price }],
    subtotal: product.price,
    total: product.price,
    shippingAddress: { fullName: 'Owner', street: '1 Main St', city: 'Test', state: 'TS', zipCode: '00000' },
  });
  server = app.listen(0);
});

after(async () => {
  await Promise.all([
    User.deleteMany({ _id: { $in: [owner._id, otherOwner._id] } }),
    Business.deleteMany({ _id: { $in: [business._id, otherBusiness._id] } }),
    NfcCard.deleteMany({ _id: card._id }),
    Order.deleteMany({ _id: order._id }),
  ]);
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close();
});

const request = (path, token, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
  ...options,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
});

test('business cannot update another business card destination', async () => {
  const response = await request(`/api/businesses/cards/${card.cardId}/destination`, generateToken(otherOwner._id), {
    method: 'PUT',
    body: JSON.stringify({ destinationUrl: 'https://example.com/attacker' }),
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).success, false);
});

test('business cannot read another business order', async () => {
  const response = await request(`/api/orders/${order._id}`, generateToken(otherOwner._id));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).success, false);
});

test('business design update is scoped to the authenticated owner', async () => {
  const response = await request('/api/businesses/my/card-design', generateToken(otherOwner._id), {
    method: 'PUT',
    body: JSON.stringify({
      title: 'Other',
      subtitle: 'review us',
      colors: { c1: '#000000', c2: '#111111', c3: '#222222', c4: '#333333' },
    }),
  });
  assert.equal(response.status, 200);
  const unchanged = await Business.findById(business._id);
  assert.notEqual(unchanged.cardDesign?.title, 'Other');
});
