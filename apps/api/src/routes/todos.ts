import {
  CreateTodoRequestSchema,
  TodoListResponseSchema,
  TodoSchema,
  UpdateTodoRequestSchema,
} from '@todo-app/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createTodo as defaultCreateTodo,
  listTodos as defaultListTodos,
  updateTodoCompleted as defaultUpdateTodoCompleted,
} from '../db/client.js';

const TodoIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export interface TodosRouteOptions {
  listTodos?: typeof defaultListTodos;
  createTodo?: typeof defaultCreateTodo;
  updateTodoCompleted?: typeof defaultUpdateTodoCompleted;
}

const todosRoutes: FastifyPluginAsync<TodosRouteOptions> = async (app, opts) => {
  const list = opts?.listTodos ?? defaultListTodos;
  const create = opts?.createTodo ?? defaultCreateTodo;
  const updateCompleted = opts?.updateTodoCompleted ?? defaultUpdateTodoCompleted;

  app.withTypeProvider<ZodTypeProvider>().get(
    '/todos',
    {
      schema: {
        tags: ['todos'],
        summary: 'List all todos in chronological order',
        description:
          'Returns the full ordered list of todos (oldest first). ' +
          'Concurrency model: last-write-wins (LWW); no ETag, no If-Match. ' +
          'Architecture mandates wrapping the array in `{ todos: [...] }` for additive evolvability (pagination, etc.).',
        response: { 200: TodoListResponseSchema },
      },
    },
    async () => {
      const todos = await list();
      return { todos };
    },
  );

  app.withTypeProvider<ZodTypeProvider>().post(
    '/todos',
    {
      schema: {
        tags: ['todos'],
        summary: 'Create a todo from text',
        description:
          'Creates a single todo. Server assigns `id` (uuid) and `createdAt` (ISO-8601). ' +
          'Body is validated against `CreateTodoRequestSchema` — `.strict()` rejects unknown ' +
          'fields with 400. No idempotency-key in v1; repeated requests insert distinct rows.',
        body: CreateTodoRequestSchema,
        response: { 201: TodoSchema },
      },
    },
    async (req, reply) => {
      const todo = await create(req.body);
      reply.code(201);
      return todo;
    },
  );

  app.withTypeProvider<ZodTypeProvider>().patch(
    '/todos/:id',
    {
      schema: {
        tags: ['todos'],
        summary: "Update a todo's completion state",
        description:
          'Sets `completed` on an existing todo. Body is validated against ' +
          '`UpdateTodoRequestSchema` — `.strict()` rejects unknown fields with 400. ' +
          'Concurrency semantics are last-write-wins; no `If-Match` or ETag is supported.',
        params: TodoIdParamsSchema,
        body: UpdateTodoRequestSchema,
        response: { 200: TodoSchema },
      },
    },
    async (req, reply) => {
      const todo = await updateCompleted(req.params.id, req.body.completed);
      if (!todo) return reply.notFound();
      return todo;
    },
  );
};

export default todosRoutes;
