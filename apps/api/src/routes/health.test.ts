import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import healthRoutes from './health.js';

async function buildAppForUnit(probe: () => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(healthRoutes, { probe });
  await app.ready();
  return app;
}

test('GET /health — 200 OK with { status: "ok" } when probe resolves', async (t) => {
  const app = await buildAppForUnit(async () => {
    /* probe succeeds */
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('GET /health — 503 degraded with checks.db: false when probe throws', async (t) => {
  const app = await buildAppForUnit(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
  });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), {
    status: 'degraded',
    checks: { db: false },
  });
});
