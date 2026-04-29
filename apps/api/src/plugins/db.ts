import fp from 'fastify-plugin';
import { db, pool } from '../db/client.js';

export default fp(
  async (app) => {
    app.decorate('db', db);

    // Idle-client errors must not crash the process — pg emits these on
    // dropped connections. Logged at warn; pool will reconnect on next acquire.
    const onPoolError = (err: Error): void => {
      app.log.warn({ err }, 'pg idle client error');
    };
    pool.on('error', onPoolError);

    // Detach + close on Fastify shutdown so re-builds in the same process
    // (test workers, hot-reload) don't accumulate listeners on the singleton pool.
    app.addHook('onClose', async () => {
      pool.off('error', onPoolError);
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
