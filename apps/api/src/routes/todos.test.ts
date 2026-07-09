import assert from 'node:assert/strict';
import { test } from 'node:test';
import sensible from '@fastify/sensible';
import type { Todo } from '@todo-app/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import todosRoutes, { type TodosRouteOptions } from './todos.js';

async function buildAppForUnit(opts: TodosRouteOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);
  await app.register(todosRoutes, opts);
  await app.ready();
  return app;
}

const SAMPLE_ID = '11111111-1111-4111-8111-111111111111';

const sampleTodo: Todo = {
  id: SAMPLE_ID,
  text: 'pick up milk',
  completed: false,
  createdAt: '2026-04-29T00:00:00.000Z',
};

test('GET /todos — returns 200 with empty array when listTodos returns []', async (t) => {
  const app = await buildAppForUnit({ listTodos: async () => [] });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { todos: [] });
});

test('GET /todos — returns 200 with stubbed todos in wire shape', async (t) => {
  const stub: Todo[] = [
    sampleTodo,
    {
      id: '22222222-2222-4222-8222-222222222222',
      text: 'walk dog',
      completed: true,
      createdAt: '2026-04-29T01:00:00.000Z',
    },
  ];
  const app = await buildAppForUnit({ listTodos: async () => stub });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { todos: stub });
});

test('POST /todos — 201 with whatever createTodo resolves to, given the parsed body', async (t) => {
  let received: unknown;
  const app = await buildAppForUnit({
    createTodo: async (input) => {
      received = input;
      return sampleTodo;
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    payload: { text: 'pick up milk' },
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), sampleTodo);
  assert.deepEqual(received, { text: 'pick up milk' });
});

test('PATCH /todos/:id — 200 with the updated todo, given the parsed id and completed', async (t) => {
  const received: { id?: string; completed?: boolean } = {};
  const app = await buildAppForUnit({
    updateTodoCompleted: async (id, completed) => {
      received.id = id;
      received.completed = completed;
      return { ...sampleTodo, completed };
    },
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${SAMPLE_ID}`,
    payload: { completed: true },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ...sampleTodo, completed: true });
  assert.deepEqual(received, { id: SAMPLE_ID, completed: true });
});

test('PATCH /todos/:id — 404 when updateTodoCompleted resolves null (no matching row)', async (t) => {
  const app = await buildAppForUnit({
    updateTodoCompleted: async () => null,
  });
  t.after(() => app.close());

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${SAMPLE_ID}`,
    payload: { completed: true },
  });
  assert.equal(res.statusCode, 404);
});

test('DELETE /todos/:id — 204 with no body, given the parsed id', async (t) => {
  let receivedId: string | undefined;
  const app = await buildAppForUnit({
    deleteTodoById: async (id) => {
      receivedId = id;
      return true;
    },
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'DELETE', url: `/todos/${SAMPLE_ID}` });
  assert.equal(res.statusCode, 204);
  assert.equal(res.body, '');
  assert.equal(receivedId, SAMPLE_ID);
});

test('DELETE /todos/:id — 404 when deleteTodoById resolves false (no matching row)', async (t) => {
  const app = await buildAppForUnit({
    deleteTodoById: async () => false,
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'DELETE', url: `/todos/${SAMPLE_ID}` });
  assert.equal(res.statusCode, 404);
});
