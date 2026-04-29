import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(
  async (app) => {
    await app.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });
  },
  { name: 'helmet' },
);
