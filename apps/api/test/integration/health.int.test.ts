import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import {
  buildFailingHealthApp,
  buildTestApp,
  clearCapturedLogs,
  getCapturedLogs,
} from './helpers/buildTestApp.js';

let app: FastifyInstance;
let failingApp: FastifyInstance;

before(async () => {
  app = await buildTestApp();
  failingApp = await buildFailingHealthApp();
});

after(async () => {
  await app.close();
  await failingApp.close();
});

beforeEach(() => {
  clearCapturedLogs(app);
  clearCapturedLogs(failingApp);
});

test('AC #1: GET /health returns 200 with { status: "ok" } against the real DB', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('AC #2: GET /health returns 503 with { status: "degraded", checks: { db: false } } when probe fails', async () => {
  const res = await failingApp.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), {
    status: 'degraded',
    checks: { db: false },
  });

  // Pino warn-level log line describing the probe failure.
  const logs = getCapturedLogs(failingApp);
  const warnLog = logs.find(
    (l) => l.level === 40 && typeof l.msg === 'string' && (l.msg as string).includes('health probe failed'),
  );
  assert.ok(warnLog, 'expected a warn-level log line containing "health probe failed"');
  // The synthetic Error's message bubbles up via the `err` serializer.
  const err = warnLog.err as { message?: string } | undefined;
  assert.equal(err?.message, 'synthetic db failure');
});
