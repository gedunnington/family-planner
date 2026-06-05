import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.LIBSQL_URL = 'file::memory:';
process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { initDb } = await import('../db.js');

beforeAll(() => initDb());

describe('Events API', () => {
  let eventId;

  it('POST /api/events creates an event', async () => {
    const res = await request(app).post('/api/events').send({
      name: 'Test Event', url: 'https://example.com', location: 'Madison, WI',
      drive_time_mins: 10, timing_notes: 'First Saturday', theme_ids: []
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    eventId = res.body.id;
  });

  it('GET /api/events returns list', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].themes).toBeDefined();
  });

  it('GET /api/events/:id returns single event', async () => {
    const res = await request(app).get(`/api/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Event');
  });

  it('PUT /api/events/:id updates event', async () => {
    const res = await request(app).put(`/api/events/${eventId}`)
      .send({ name: 'Updated Event', url: 'https://example.com',
              location: 'Madison, WI', drive_time_mins: 15,
              timing_notes: 'First Saturday', theme_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Event');
  });

  it('DELETE /api/events/:id removes event', async () => {
    const res = await request(app).delete(`/api/events/${eventId}`);
    expect(res.status).toBe(204);
  });
});
