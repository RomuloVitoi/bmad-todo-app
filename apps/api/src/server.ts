import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { buildApp } from './app.js';

// Accept inbound `x-request-id` only if it looks safe — UUID-shaped or a
// limited charset, ≤64 chars. Otherwise generate. Stops log-injection /
// log-forging via hostile or oversized header values.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function main(): Promise<void> {
  const app = Fastify({
    // `requestIdHeader` is intentionally NOT set: when Fastify reads the
    // header itself, it uses the value verbatim and bypasses genReqId — so
    // hostile content would be accepted. Header parsing lives entirely in
    // genReqId so the safe-id regex runs on every request.
    requestIdLogLabel: 'requestId',
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) {
        return incoming;
      }
      return randomUUID();
    },
    bodyLimit: 4096,
    // v1: deployment-platform assumption deferred per architecture (single trusted
    // TLS terminator). Permissive `trustProxy: true` lets X-Forwarded-For-spoofed
    // clients bypass rate-limit until the platform's proxy topology is pinned —
    // tighten to a CIDR allow-list or hop count in Story 1.11 deployment hardening.
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // AC #4 / architecture §Communication Patterns: emit `method`, `path`,
      // `statusCode`, `durationMs` directly on every request log line.
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
    },
  });

  await buildApp(app);

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void shutdown(sig);
    });
  }

  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    try {
      await app.close();
    } catch (closeErr) {
      app.log.error({ err: closeErr }, 'cleanup after listen failure also failed');
    }
    process.exit(1);
  }
}

void main();
