import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(
  async (app) => {
    await app.register(cors, {
      origin: app.config.CORS_ORIGIN,
      credentials: false,
      exposedHeaders: ['x-request-id'],
    });
  },
  { name: 'cors', dependencies: ['@fastify/env'] },
);
