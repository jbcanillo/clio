import request from 'supertest';
import { createApp } from '../app.js';

describe('health', () => {
  it('GET /health returns 200 {status:"ok"} without authentication', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
