import request from 'supertest';
import { createApp } from '../app.js';
import { createAuth } from '../services/authService.js';

const make = () => createApp({ auth: createAuth({ password: 'pw', ttlHours: 8 }) });

describe('auth over HTTP', () => {
  it('POST /api/auth/login with the right password returns a token', async () => {
    const res = await request(make()).post('/api/auth/login').send({ password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns 400 when the body has no password', async () => {
    const res = await request(make()).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
  it('returns 401 for a wrong password', async () => {
    const res = await request(make()).post('/api/auth/login').send({ password: 'x' });
    expect(res.status).toBe(401);
  });
  it('returns 429 once locked', async () => {
    const app = make();
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ password: 'x' });
    const res = await request(app).post('/api/auth/login').send({ password: 'pw' });
    expect(res.status).toBe(429);
  });
  it('protects /api routes: 401 without a token, passes with one', async () => {
    const app = make();
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    const { body } = await request(app).post('/api/auth/login').send({ password: 'pw' });
    const authed = await request(app).get('/api/anything').set('X-Session-Token', body.token);
    expect(authed.status).toBe(404); // authenticated, route simply does not exist
  });
  it('keeps /health public', async () => {
    expect((await request(make()).get('/health')).status).toBe(200);
  });
});
