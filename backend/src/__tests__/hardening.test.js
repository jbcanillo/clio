import request from 'supertest';
import { makeApi } from './helpers/api.js';

describe('rate limits', () => {
  it('limits /api/copilotkit to 10 requests per minute', async () => {
    const { as } = await makeApi();
    for (let i = 0; i < 10; i++) expect((await as('post', '/api/copilotkit').send({})).status).not.toBe(429);
    const res = await as('post', '/api/copilotkit').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
  });
  it('limits login attempts to 5 per minute, even with the right password', async () => {
    const { app } = await makeApi();
    // makeApi already logged in once, so 4 more attempts fit
    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/login').send({ password: 'wrong' });
    const res = await request(app).post('/api/auth/login').send({ password: 'pw' });
    expect(res.status).toBe(429);
  });
  it('limits the rest of /api per IP and leaves /health alone', async () => {
    const { app, as } = await makeApi({ rateLimits: { api: 6 } });
    for (let i = 0; i < 5; i++) expect((await as('get', '/api/reminders')).status).toBe(200);
    expect((await as('get', '/api/reminders')).status).toBe(429);
    for (let i = 0; i < 10; i++) expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('request size caps', () => {
  it('rejects a 120 KB body on /api/copilotkit with 413', async () => {
    const { as } = await makeApi();
    const res = await as('post', '/api/copilotkit').set('Content-Type', 'application/json').send(JSON.stringify({ pad: 'x'.repeat(120 * 1024) }));
    expect(res.status).toBe(413);
  });
  it('rejects a 2 MB body on a normal route but accepts it on /api/import (up to 5 MB)', async () => {
    const { as } = await makeApi();
    const big = JSON.stringify({ reminders: [], journals: [], pad: 'x'.repeat(2 * 1024 * 1024) });
    expect((await as('post', '/api/reminders').set('Content-Type', 'application/json').send(big)).status).toBe(413);
    expect((await as('post', '/api/import/numdum').set('Content-Type', 'application/json').send(big)).status).not.toBe(413);
    const huge = JSON.stringify({ pad: 'x'.repeat(6 * 1024 * 1024) });
    expect((await as('post', '/api/import/numdum').set('Content-Type', 'application/json').send(huge)).status).toBe(413);
  });
  it('answers malformed JSON with 400, not a stack trace', async () => {
    const { as } = await makeApi();
    const res = await as('post', '/api/reminders').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });
});

describe('security headers', () => {
  it('sets nosniff and hides the framework', async () => {
    const { app } = await makeApi();
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
