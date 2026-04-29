import fp from 'fastify-plugin';
import { db } from '../db/client.js';

export default fp(
  async (app) => {
    app.decorate('db', db);
  },
  { name: 'db' },
);

declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
  }
}
