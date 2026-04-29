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

test('POST /todos — happy path: returns 201 with the created todo (AC #1)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'buy milk' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as { id: string; text: string; completed: boolean; createdAt: string };
  assert.match(body.id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.text, 'buy milk');
  assert.equal(body.completed, false);
  assert.match(body.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('POST /todos — id is unique per request (server-generated by Postgres) (AC #1)', async () => {
  const a = await app.inject({ method: 'POST', url: '/todos', payload: { text: 'one' } });
  const b = await app.inject({ method: 'POST', url: '/todos', payload: { text: 'two' } });
  const idA = (a.json() as { id: string }).id;
  const idB = (b.json() as { id: string }).id;
  assert.notEqual(idA, idB);
});

test('POST /todos — text is trimmed by the schema (AC #2)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: '  buy milk  ' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal((res.json() as { text: string }).text, 'buy milk');
});

test('POST /todos — empty string rejected with 400 and no row inserted (AC #3)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: '' },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { statusCode: number; error: string; message: string };
  assert.equal(body.statusCode, 400);
  assert.equal(body.error, 'Bad Request');
  assert.equal(typeof body.message, 'string');
  const list = await app.inject({ method: 'GET', url: '/todos' });
  assert.deepEqual(list.json(), { todos: [] });
});

test('POST /todos — whitespace-only rejected with 400 (trim then min(1)) (AC #3)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: '     ' },
  });
  assert.equal(res.statusCode, 400);
  const list = await app.inject({ method: 'GET', url: '/todos' });
  assert.deepEqual(list.json(), { todos: [] });
});

test('POST /todos — 501-char text rejected with 400 (AC #3)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'x'.repeat(501) },
  });
  assert.equal(res.statusCode, 400);
  const list = await app.inject({ method: 'GET', url: '/todos' });
  assert.deepEqual(list.json(), { todos: [] });
});

test('POST /todos — unknown field `completed` rejected with 400 (strict schema) (AC #4)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'x', completed: true },
  });
  assert.equal(res.statusCode, 400);
  const list = await app.inject({ method: 'GET', url: '/todos' });
  assert.deepEqual(list.json(), { todos: [] });
});

test('POST /todos — unknown field `id` rejected with 400 (strict schema) (AC #4)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'x', id: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(res.statusCode, 400);
  const list = await app.inject({ method: 'GET', url: '/todos' });
  assert.deepEqual(list.json(), { todos: [] });
});

test('POST /todos — round-trip: created todos appear in subsequent GET /todos (AC #7)', async () => {
  await app.inject({ method: 'POST', url: '/todos', payload: { text: 'first' } });
  await app.inject({ method: 'POST', url: '/todos', payload: { text: 'second' } });
  const list = await app.inject({ method: 'GET', url: '/todos' });
  const body = list.json() as { todos: Array<{ text: string; completed: boolean }> };
  assert.deepEqual(
    body.todos.map((t) => t.text),
    ['first', 'second'],
  );
  assert.equal(body.todos[0]!.completed, false);
  assert.equal(body.todos[1]!.completed, false);
});

test('PATCH /todos/:id — toggles false→true on an existing row (AC #1)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'walk dog' },
  });
  const { id } = created.json() as { id: string };

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { completed: true },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { id: string; text: string; completed: boolean };
  assert.equal(body.id, id);
  assert.equal(body.text, 'walk dog');
  assert.equal(body.completed, true);

  const list = await app.inject({ method: 'GET', url: '/todos' });
  const todos = (list.json() as { todos: Array<{ id: string; completed: boolean }> }).todos;
  assert.equal(todos.find((t) => t.id === id)?.completed, true);
});

test('PATCH /todos/:id — toggles true→false (AC #2)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'wake up' },
  });
  const { id } = created.json() as { id: string };
  await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } });

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { completed: false },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { id: string; text: string; completed: boolean };
  assert.equal(body.id, id);
  assert.equal(body.text, 'wake up');
  assert.equal(body.completed, false);
});

test('PATCH /todos/:id — same value twice is idempotent (AC #2)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'meditate' },
  });
  const { id } = created.json() as { id: string };

  const a = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { completed: true },
  });
  const b = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { completed: true },
  });
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal((b.json() as { completed: boolean }).completed, true);
});

test('PATCH /todos/:id — 404 on a valid-but-missing UUID (AC #3)', async () => {
  const ghostId = '00000000-0000-4000-8000-000000000000';
  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${ghostId}`,
    payload: { completed: true },
  });
  assert.equal(res.statusCode, 404);
  const body = res.json() as { statusCode: number; error: string; message: string };
  assert.equal(body.statusCode, 404);
  assert.equal(body.error, 'Not Found');
  assert.equal(typeof body.message, 'string');
});

test('PATCH /todos/:id — 400 on a malformed UUID (AC #4)', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: '/todos/not-a-uuid',
    payload: { completed: true },
  });
  assert.equal(res.statusCode, 400);
});

test('PATCH /todos/:id — 400 on empty body, row unchanged (AC #5)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'breathe' },
  });
  const { id } = created.json() as { id: string };

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: {},
  });
  assert.equal(res.statusCode, 400);

  const list = await app.inject({ method: 'GET', url: '/todos' });
  const todo = (list.json() as { todos: Array<{ id: string; completed: boolean }> }).todos.find(
    (t) => t.id === id,
  );
  assert.equal(todo?.completed, false);
});

test('PATCH /todos/:id — 400 on missing `completed` field (AC #5)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'stretch' },
  });
  const { id } = created.json() as { id: string };

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { something: 'else' },
  });
  assert.equal(res.statusCode, 400);
});

test('PATCH /todos/:id — 400 on unknown field via `.strict()` (AC #5)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'eat lunch' },
  });
  const { id } = created.json() as { id: string };

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    payload: { completed: true, text: 'oops' },
  });
  assert.equal(res.statusCode, 400);
});
