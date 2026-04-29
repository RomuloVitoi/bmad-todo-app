import fp from 'fastify-plugin';
import cors from '@fastify/cors';

// Normalize CORS_ORIGIN: strip surrounding whitespace and any trailing slash
// so `Origin` header matches reliably (browsers never send a trailing slash,
// and env vars often pick up either by accident).
function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export default fp(
  async (app) => {
    const allowed = normalizeOrigin(app.config.CORS_ORIGIN);
    await app.register(cors, {
      // Function-mode rather than string. With string mode, @fastify/cors
      // always echoes the configured Origin in `Access-Control-Allow-Origin`
      // regardless of the inbound `Origin` — the browser's same-origin check
      // catches mismatches client-side, but the AC requires server-side
      // rejection. Function mode omits the ACAO header on mismatch.
      origin: (incoming, cb) => {
        // Same-origin / no-Origin requests (curl, server-to-server) — allow.
        if (!incoming) return cb(null, true);
        cb(null, incoming === allowed);
      },
      credentials: false,
      exposedHeaders: ['x-request-id'],
    });
  },
  { name: 'cors', dependencies: ['@fastify/env'] },
);
