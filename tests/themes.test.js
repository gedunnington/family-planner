import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.LIBSQL_URL = 'file::memory:';
process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { initDb } = await import('../db.js');

beforeAll(() => initDb());

describe('Themes API', () => {
  let themeId;

  it('POST /api/themes creates a theme', async () => {
    const res = await request(app).post('/api/themes').send({
      name: 'Community', description: 'Kids contribute meaningfully', source: 'Hunt Gather Parent'
    });
    expect(res.status).toBe(201);
    themeId = res.body.id;
  });

  it('GET /api/themes returns list', async () => {
    const res = await request(app).get('/api/themes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('PUT /api/themes/:id updates a theme', async () => {
    const res = await request(app).put(`/api/themes/${themeId}`)
      .send({ name: 'Community Updated', description: 'Updated', source: 'Hunt Gather Parent' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Community Updated');
  });

  it('DELETE /api/themes/:id removes theme', async () => {
    const res = await request(app).delete(`/api/themes/${themeId}`);
    expect(res.status).toBe(204);
  });
});
