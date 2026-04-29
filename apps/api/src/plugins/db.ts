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
    // pool.end() throws "Called end on pool more than once" if a sibling
    // Fastify instance has already torn down the module-singleton pool —
    // swallow that specific case so multi-instance teardown is idempotent.
    // (Story 1.5 deferred-work item; surfaced in Story 1.6 test infrastructure.)
    app.addHook('onClose', async () => {
      pool.off('error', onPoolError);
      try {
        await pool.end();
      } catch (err) {
        if (err instanceof Error && err.message.includes('end on pool more than once')) {
          return;
        }
        throw err;
      }
    });
  },
  { name: 'db', dependencies: ['@fastify/env'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
  }
}
