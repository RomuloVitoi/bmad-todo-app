import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Todo } from '@todo-app/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import todosRoutes from './todos.js';

async function buildAppForUnit(listTodos: () => Promise<Todo[]>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(todosRoutes, { listTodos });
  await app.ready();
  return app;
}

test('GET /todos — returns 200 with empty array when listTodos returns []', async (t) => {
  const app = await buildAppForUnit(async () => []);
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { todos: [] });
});

test('GET /todos — returns 200 with stubbed todos in wire shape', async (t) => {
  const stub: Todo[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'pick up milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      text: 'walk dog',
      completed: true,
      createdAt: '2026-04-29T01:00:00.000Z',
    },
  ];
  const app = await buildAppForUnit(async () => stub);
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { todos: stub });
});
