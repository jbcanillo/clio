import request from 'supertest';
import { makeApi } from './helpers/api.js';

describe('session share toggle', () => {
  it('is off by default, can be turned on, and does not carry over to a new login', async () => {
    const { app, as } = await makeApi();
    expect((await as('get', '/api/session/share')).body).toEqual({ on: false });
    expect((await as('post', '/api/session/share').send({ on: true })).body).toEqual({ on: true });
    expect((await as('get', '/api/session/share')).body).toEqual({ on: true });
    const second = await request(app).post('/api/auth/login').send({ password: 'pw' });
    const again = await request(app).get('/api/session/share').set('X-Session-Token', second.body.token);
    expect(again.body).toEqual({ on: false });
  });
  it('rejects a non-boolean value with 400 and requires auth', async () => {
    const { app, as } = await makeApi();
    expect((await as('post', '/api/session/share').send({ on: 'yes' })).status).toBe(400);
    expect((await request(app).get('/api/session/share')).status).toBe(401);
  });
});
