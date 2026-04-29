import { TodoListResponseSchema } from '@todo-app/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listTodos as defaultListTodos } from '../db/client.js';

export interface TodosRouteOptions {
  listTodos?: typeof defaultListTodos;
}

const todosRoutes: FastifyPluginAsync<TodosRouteOptions> = async (app, opts) => {
  const list = opts?.listTodos ?? defaultListTodos;

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
};

export default todosRoutes;
