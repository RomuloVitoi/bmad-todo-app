import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/buildTestApp.js';
import { resetTodos } from './helpers/seedDb.js';

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

test('PATCH /todos/:id — concurrent opposite writes both succeed; final state is one of the two (LWW, AC #6)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'race condition' },
  });
  assert.equal(created.statusCode, 201);
  const { id } = created.json() as { id: string };

  // Issue both PATCHes in parallel — Promise.all races at the event-loop level.
  // The DB is the synchronisation point; both writes commit, the second wins
  // per Postgres row-level locking on UPDATE.
  const [a, b] = await Promise.all([
    app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } }),
    app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: false } }),
  ]);

  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);

  // Final row state must equal one of the two writes (no corruption, no third value).
  // We do NOT assert which won — that is the LWW non-determinism.
  const list = await app.inject({ method: 'GET', url: '/todos' });
  const final = (list.json() as { todos: Array<{ id: string; completed: boolean }> }).todos.find(
    (t) => t.id === id,
  );
  assert.ok(final, 'row should still exist after concurrent PATCHes');
  assert.ok(
    final.completed === true || final.completed === false,
    'final completed must be a boolean',
  );
});

test('DELETE /todos/:id — concurrent deletes: exactly one 204, one 404, row removed once (AC #5)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'race to delete' },
  });
  assert.equal(created.statusCode, 201);
  const { id } = created.json() as { id: string };

  // Two parallel DELETEs against the same row. One row lock wins; the other
  // observes 0 affected rows. Both helpers return cleanly — no error, no
  // deadlock, no constraint violation.
  const [a, b] = await Promise.all([
    app.inject({ method: 'DELETE', url: `/todos/${id}` }),
    app.inject({ method: 'DELETE', url: `/todos/${id}` }),
  ]);

  // Sort outcomes — the loser/winner identity is non-deterministic.
  const codes = [a.statusCode, b.statusCode].sort();
  assert.deepEqual(codes, [204, 404]);

  // Row is gone exactly once (not twice — there was only one to begin with).
  const list = await app.inject({ method: 'GET', url: '/todos' });
  const todos = (list.json() as { todos: Array<{ id: string }> }).todos;
  assert.equal(
    todos.find((t) => t.id === id),
    undefined,
  );
});
