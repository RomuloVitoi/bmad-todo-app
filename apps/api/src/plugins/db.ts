import fp from 'fastify-plugin';
import { db, pool } from '../db/client.js';

export default fp(
  async (app) => {
    app.decorate('db', db);

    pool.on('error', (err) => {
      app.log.warn({ err }, 'pg idle client error');
    });

    app.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'db', dependencies: ['@fastify/env'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
  }
}
