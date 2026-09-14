import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDB } from '../config/db.js';
import { ensureDefaultAdmin } from '../server.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '5101';

const { default: app } = await import('../server.js');

await connectDB();
await ensureDefaultAdmin();

async function makeRequest(path, options = {}) {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('login accepts the seeded admin credentials and returns a success payload', async () => {
  const result = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });

  assert.equal(result.status, 200, `Expected 200, got ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.user.username, 'admin');
  assert.equal(result.body.data.user.role, 'admin');
});

test('me endpoint returns the authenticated user profile in the standard data wrapper', async () => {
  const loginResult = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });

  assert.equal(loginResult.status, 200);
  const token = loginResult.body.data.token;

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.data.user.username, 'admin');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
