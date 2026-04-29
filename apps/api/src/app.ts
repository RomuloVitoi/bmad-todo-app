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
import swaggerPlugin from './plugins/swagger.js';
import healthRoutes from './routes/health.js';
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

  // Swagger MUST register before routes — it hooks `onRoute` and only sees
  // routes registered after itself. Plugin returns early when docs are disabled.
  await app.register(swaggerPlugin);

  await app.register(todosRoutes);
  await app.register(healthRoutes);

  app.setErrorHandler((err, req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) {
      // 4xx are normal client errors (validation 400, 404 etc.) — info-level.
      // 5xx that arrive here pre-typed (e.g., reply.internalServerError()) — warn.
      const log = statusCode >= 500 ? req.log.warn : req.log.info;
      log.call(req.log, { err }, 'request error');
      return reply.send(err);
    }
    // Truly unhandled — log at error level with full stack and return the 500 envelope.
    req.log.error({ err }, 'unhandled error');
    return reply.internalServerError();
  });
}
