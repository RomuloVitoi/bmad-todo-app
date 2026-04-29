import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, clearCapturedLogs, getCapturedLogs } from './helpers/buildTestApp.js';
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
  clearCapturedLogs(app);
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

test('hostile inbound x-request-id is rejected; server generates a UUID instead', async () => {
  const hostile = '<script>alert(1)</script>';
  const res = await app.inject({
    method: 'GET',
    url: '/todos',
    headers: { 'x-request-id': hostile },
  });
  const echoed = res.headers['x-request-id'] as string;
  assert.notEqual(echoed, hostile);
  assert.match(echoed, /^[0-9a-f-]{36}$/i);
});

test('AC #4: requestId/method/path/statusCode/durationMs emitted across the request log lines', async () => {
  // Fastify emits two log lines per request: "incoming request" carries
  // req.{method,path}; "request completed" carries res.statusCode and
  // durationMs. Both lines are correlated via requestId. The architecture's
  // diagnostic intent — knowing all five fields per request — is met across
  // this pair.
  const id = '22222222-3333-4444-8555-666666666666';
  await app.inject({ method: 'GET', url: '/todos', headers: { 'x-request-id': id } });

  const logs = getCapturedLogs(app);
  const incoming = logs.find((l) => l.msg === 'incoming request' && l.requestId === id);
  const completed = logs.find((l) => l.msg === 'request completed' && l.requestId === id);

  assert.ok(incoming, 'expected an "incoming request" log line tagged with the requestId');
  assert.equal((incoming.req as { method: string }).method, 'GET');
  assert.equal((incoming.req as { path: string }).path, '/todos');

  assert.ok(completed, 'expected a "request completed" log line tagged with the requestId');
  assert.equal((completed.res as { statusCode: number }).statusCode, 200);
  assert.equal(typeof completed.durationMs, 'number');
});

test('AC #8: unhandled errors return the sensible 500 envelope and log at error level', async () => {
  const id = '33333333-4444-4555-8666-777777777777';
  const res = await app.inject({
    method: 'GET',
    url: '/__test/throw',
    headers: { 'x-request-id': id },
  });

  assert.equal(res.statusCode, 500);
  const body = res.json() as { statusCode: number; error: string; message: string };
  assert.equal(body.statusCode, 500);
  assert.equal(body.error, 'Internal Server Error');
  assert.equal(typeof body.message, 'string');

  const logs = getCapturedLogs(app);
  const errorLog = logs.find(
    (l) => l.level === 50 && l.msg === 'unhandled error',
  );
  assert.ok(errorLog, 'expected an error-level log line for the unhandled error');
  assert.equal(errorLog.requestId, id);
  const errPayload = errorLog.err as { message?: string; stack?: string };
  assert.equal(errPayload.message, 'intentional test failure');
  assert.match(errPayload.stack ?? '', /at /);
});

test('AC #2: a non-matching Origin is not allowed (no Access-Control-Allow-Origin)', async () => {
  // Real preflight: OPTIONS with a hostile Origin and a CORS-triggering method.
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/todos',
    headers: {
      origin: 'http://attacker.example.com',
      'access-control-request-method': 'GET',
    },
  });
  // CORS plugin doesn't set Access-Control-Allow-Origin for non-matching origins.
  // Browsers then block the actual request.
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('AC #2: a matching Origin gets Access-Control-Allow-Origin reflected', async () => {
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/todos',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
});
