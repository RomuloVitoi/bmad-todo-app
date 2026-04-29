import fp from 'fastify-plugin';
import { fastifyRequestContext, requestContext } from '@fastify/request-context';

export default fp(
  async (app) => {
    await app.register(fastifyRequestContext);

    app.addHook('onRequest', async (req) => {
      requestContext.set('reqId', req.id);
    });
    app.addHook('onSend', async (req, reply) => {
      reply.header('x-request-id', req.id);
    });
  },
  { name: 'request-context' },
);

declare module '@fastify/request-context' {
  interface RequestContextData {
    reqId: string;
  }
}
