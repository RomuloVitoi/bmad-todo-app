import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/buildTestApp.js';
import { resetTodos, seedTodos } from './helpers/seedDb.js';

let app: FastifyInstance;

before(async () => {
  app = await buildTestApp();
});

after(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetTodos();
});

test('GET /todos — empty list returns 200 with []', async () => {
  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { todos: [] });
});

test('GET /todos — populated list returns rows ordered by createdAt asc', async () => {
  const t0 = new Date('2026-04-01T00:00:00.000Z');
  const t1 = new Date('2026-04-02T00:00:00.000Z');
  const t2 = new Date('2026-04-03T00:00:00.000Z');
  // insert in non-chronological order to prove ORDER BY works
  await seedTodos([
    { text: 'second', createdAt: t1 },
    { text: 'third', createdAt: t2 },
    { text: 'first', createdAt: t0 },
  ]);

  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { todos: Array<{ text: string; createdAt: string }> };
  assert.deepEqual(
    body.todos.map((t) => t.text),
    ['first', 'second', 'third'],
  );
  assert.equal(body.todos[0]!.createdAt, '2026-04-01T00:00:00.000Z');
});

test('x-request-id is echoed when sent', async () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const res = await app.inject({
    method: 'GET',
    url: '/todos',
    headers: { 'x-request-id': id },
  });
  assert.equal(res.headers['x-request-id'], id);
});

test('x-request-id is generated when absent', async () => {
  const res = await app.inject({ method: 'GET', url: '/todos' });
  const echoed = res.headers['x-request-id'];
  assert.match(echoed as string, /^[0-9a-f-]{36}$/i);
});
