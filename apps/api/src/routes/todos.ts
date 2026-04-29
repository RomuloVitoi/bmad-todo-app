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
