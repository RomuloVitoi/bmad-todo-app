import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => randomUUID(),
    bodyLimit: 4096,
    trustProxy: true,
    logger: { level: 'silent' },
  });
  await buildApp(app);
  await app.ready();
  return app;
}
