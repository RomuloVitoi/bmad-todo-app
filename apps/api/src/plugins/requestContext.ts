import fp from 'fastify-plugin';
import { fastifyRequestContext } from '@fastify/request-context';

// Registers @fastify/request-context (AsyncLocalStorage primitive available
// to future code) and echoes the request's correlation ID on responses.
// `requestId` already lands in every Pino log line via Fastify's
// `requestIdLogLabel` option (set in server.ts), so no AsyncLocalStorage
// reader is wired here yet.
export default fp(
  async (app) => {
    await app.register(fastifyRequestContext);

    app.addHook('onSend', async (req, reply) => {
      reply.header('x-request-id', req.id);
    });
  },
  { name: 'request-context' },
);
