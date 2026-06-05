import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.LIBSQL_URL = 'file::memory:';
process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { initDb } = await import('../db.js');

beforeAll(() => initDb());

describe('Dismissed API', () => {
  let dismissedId;

  it('POST /api/dismissed creates a dismissal', async () => {
    const res = await request(app).post('/api/dismissed').send({
      event_name: 'Boring Event', source_url: 'https://example.com'
    });
    expect(res.status).toBe(201);
    dismissedId = res.body.id;
  });

  it('GET /api/dismissed returns list', async () => {
    const res = await request(app).get('/api/dismissed');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('DELETE /api/dismissed/:id restores event', async () => {
    const res = await request(app).delete(`/api/dismissed/${dismissedId}`);
    expect(res.status).toBe(204);
    const list = await request(app).get('/api/dismissed');
    expect(list.body.length).toBe(0);
  });
});
