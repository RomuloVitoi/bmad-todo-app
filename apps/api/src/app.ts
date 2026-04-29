import fastifyEnv from '@fastify/env';
import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { envSchema } from './config.js';
import corsPlugin from './plugins/cors.js';
import dbPlugin from './plugins/db.js';
import helmetPlugin from './plugins/helmet.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import requestContextPlugin from './plugins/requestContext.js';
import todosRoutes from './routes/todos.js';

export async function buildApp(app: FastifyInstance): Promise<void> {
  await app.register(fastifyEnv, {
    confKey: 'config',
    schema: envSchema,
    dotenv: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  await app.register(requestContextPlugin);
  await app.register(helmetPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);

  await app.register(dbPlugin);

  await app.register(todosRoutes);

  app.setErrorHandler((err, req, reply) => {
    if ((err as { statusCode?: number }).statusCode) {
      req.log.warn({ err }, 'request error');
      return reply.send(err);
    }
    req.log.error({ err }, 'unhandled error');
    return reply.internalServerError();
  });
}
