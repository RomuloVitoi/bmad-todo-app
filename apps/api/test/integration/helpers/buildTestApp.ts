import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import healthRoutes from '../../../src/routes/health.js';

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

interface FastifyOptionsForTests {
  logger: {
    level: string;
    serializers: object;
    formatters: object;
    stream: { write(line: string): void };
  };
  requestIdLogLabel: string;
  genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => string;
  bodyLimit: number;
  trustProxy: boolean;
}

function makeFastifyOptions(lines: Array<Record<string, unknown>>): FastifyOptionsForTests {
  return {
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
      serializers: {
        req(req: { method: string; url: string }) {
          return { method: req.method, path: req.url };
        },
        res(res: { statusCode: number }) {
          return { statusCode: res.statusCode };
        },
      },
      formatters: {
        log(obj: Record<string, unknown> & { responseTime?: unknown }) {
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
  };
}

export interface BuildTestAppOptions {
  // Mounts a SECOND `healthRoutes` plugin under `/internal-test` with a
  // throwing probe — exercises AC #2 (503 degraded path) inside the FULL
  // production plugin stack, instead of a parallel minimal app. Tests assert
  // against `GET /internal-test/health`.
  failingHealthProbe?: boolean;
}

export async function buildTestApp(opts: BuildTestAppOptions = {}): Promise<FastifyInstance> {
  const lines: Array<Record<string, unknown>> = [];
  const app = Fastify(makeFastifyOptions(lines));

  await buildApp(app);

  // Test-only route that always throws — exercises AC #8 (global setErrorHandler
  // returns the sensible 500 envelope and emits an `error`-level log line with
  // the full Error). Gated to test builds: only registered here, never in
  // src/app.ts which buildApp() owns for production.
  app.get('/__test/throw', async () => {
    throw new Error('intentional test failure');
  });

  // Story 1.6 AC #2 (503 degraded path) coverage inside the full prod stack.
  // Mounting the failing variant under a different prefix avoids clashing with
  // the production /health route (registered by buildApp). The plugin's route
  // handler logic is identical for both — only the injected probe differs.
  if (opts.failingHealthProbe) {
    await app.register(healthRoutes, {
      prefix: '/internal-test',
      probe: async () => {
        throw new Error('synthetic db failure');
      },
    });
  }

  await app.ready();
  buffers.set(app, lines);
  return app;
}

// Story 1.6 AC #4: /docs returns 404 in production. Mutates process.env.NODE_ENV
// before app construction so @fastify/env picks up the production value at
// register time, then restores it on app.close(). Caller must `await app.close()`
// (idiomatic in `t.after`/`after()` hooks).
export async function buildProductionTestApp(): Promise<FastifyInstance> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDocs = process.env.ENABLE_DOCS;
  process.env.NODE_ENV = 'production';
  delete process.env.ENABLE_DOCS;

  const restoreEnv = (): void => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalEnableDocs === undefined) delete process.env.ENABLE_DOCS;
    else process.env.ENABLE_DOCS = originalEnableDocs;
  };

  let app: FastifyInstance | undefined;
  try {
    const lines: Array<Record<string, unknown>> = [];
    app = Fastify(makeFastifyOptions(lines));
    await buildApp(app);

    // Restore env on close so subsequent tests see the original values.
    // Hook MUST be registered before app.ready() — Fastify forbids
    // addHook after the instance has started.
    app.addHook('onClose', async () => {
      restoreEnv();
    });

    await app.ready();
    buffers.set(app, lines);

    return app;
  } catch (err) {
    // Close partially-built app so listeners (esp. pool.on('error', ...))
    // and Fastify-internal resources don't leak. swallow nested errors —
    // surfacing the original `err` is more useful than the close failure.
    if (app) {
      await app.close().catch(() => {
        /* close-on-build-failure best-effort */
      });
    }
    restoreEnv();
    throw err;
  }
}
