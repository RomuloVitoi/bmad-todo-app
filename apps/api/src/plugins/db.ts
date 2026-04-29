import fp from 'fastify-plugin';
import { db, pool } from '../db/client.js';

// Module-scoped flag that tracks whether the singleton pg pool has been ended
// by ANY Fastify instance built in this process. Multiple `buildApp()` calls
// (test workers, hot-reload) share the singleton; a second `pool.end()` on an
// already-ended pool throws — guarded here so multi-instance teardown is
// idempotent. Resilient to upstream pg-pool error-message changes (the prior
// substring-match approach was fragile).
// Architectural fix (per-instance pool factory) is the long-term solution —
// see deferred-work.md "Pool teardown idempotency masks the deeper architectural concern".
let poolEnded = false;

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
      if (poolEnded) return;
      poolEnded = true;
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
