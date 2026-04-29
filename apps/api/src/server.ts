import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = Fastify({
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => randomUUID(),
    bodyLimit: 4096,
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await buildApp(app);

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      app.log.info({ signal: sig }, 'shutting down');
      await app.close();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
