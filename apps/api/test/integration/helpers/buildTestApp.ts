import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
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

export async function buildTestApp(): Promise<FastifyInstance> {
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

  await app.ready();
  buffers.set(app, lines);
  return app;
}

// Story 1.6 AC #2: 503 degraded path. Produces a minimal app with ONLY the
// healthRoutes plugin and a probe stub that throws — bypasses the production
// /health route's real DB probe so the failure mode is deterministic. Logger
// config matches buildTestApp() so AC's "warn-level log" assertion works.
export async function buildFailingHealthApp(): Promise<FastifyInstance> {
  const lines: Array<Record<string, unknown>> = [];
  const app = Fastify(makeFastifyOptions(lines));

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(healthRoutes, {
    probe: async () => {
      throw new Error('synthetic db failure');
    },
  });

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

  try {
    const lines: Array<Record<string, unknown>> = [];
    const app = Fastify(makeFastifyOptions(lines));
    await buildApp(app);

    // Restore env on close so subsequent tests see the original values.
    // Hook MUST be registered before app.ready() — Fastify forbids
    // addHook after the instance has started.
    app.addHook('onClose', async () => {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalEnableDocs === undefined) delete process.env.ENABLE_DOCS;
      else process.env.ENABLE_DOCS = originalEnableDocs;
    });

    await app.ready();
    buffers.set(app, lines);

    return app;
  } catch (err) {
    // If buildApp fails, restore env immediately so we don't poison the test process.
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalEnableDocs === undefined) delete process.env.ENABLE_DOCS;
    else process.env.ENABLE_DOCS = originalEnableDocs;
    throw err;
  }
}
