import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';

// Mirrors src/server.ts so tests exercise production behavior.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Per-app log buffer. We mutate this array in place (never re-assign) so the
// reference held by the Pino stream closure stays in sync with what tests read.
const buffers = new WeakMap<FastifyInstance, Array<Record<string, unknown>>>();

export function getCapturedLogs(app: FastifyInstance): Array<Record<string, unknown>> {
  return buffers.get(app) ?? [];
}

export function clearCapturedLogs(app: FastifyInstance): void {
  const lines = buffers.get(app);
  if (lines) lines.length = 0;
}

export async function buildTestApp(): Promise<FastifyInstance> {
  const lines: Array<Record<string, unknown>> = [];

  const app = Fastify({
    // See src/server.ts — requestIdHeader omitted on purpose so genReqId runs
    // for every request and the safe-id regex applies to inbound headers.
    requestIdLogLabel: 'requestId',
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) {
        return incoming;
      }
      return randomUUID();
    },
    bodyLimit: 4096,
    trustProxy: true,
    logger: {
      level: 'info',
      // Mirrors src/server.ts so log shape under test matches production.
      serializers: {
        req(req) {
          return { method: req.method, path: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
      formatters: {
        log(obj) {
          if (typeof obj.responseTime === 'number') {
            return { ...obj, durationMs: obj.responseTime, responseTime: undefined };
          }
          return obj;
        },
      },
      stream: {
        write(line: string) {
          try {
            lines.push(JSON.parse(line) as Record<string, unknown>);
          } catch {
            // ignore non-JSON lines (shouldn't happen with Pino default)
          }
        },
      },
    },
  });

  await buildApp(app);

  // Test-only route that always throws — exercises AC #8 (global setErrorHandler
  // returns the sensible 500 envelope and emits an `error`-level log line with
  // the full Error). Gated to test builds: only registered here, never in
  // src/app.ts which buildApp() owns for production.
  app.get('/__test/throw', async () => {
    throw new Error('intentional test failure');
  });

  await app.ready();
  buffers.set(app, lines);
  return app;
}
