import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

// Internal probe envelope — NOT in packages/shared. The contract package is
// reserved for the public Todo wire surface; /health may evolve independently.
const HealthOkSchema = z.object({ status: z.literal('ok') }).strict();
const HealthDegradedSchema = z
  .object({
    status: z.literal('degraded'),
    checks: z.object({ db: z.boolean() }).strict(),
  })
  .strict();

export interface HealthRouteOptions {
  // DI for tests — production uses app.db.execute(sql`SELECT 1`).
  // Resolves on a successful round-trip; throws on failure.
  probe?: () => Promise<void>;
}

const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, opts) => {
  const probe =
    opts?.probe ??
    (async () => {
      await app.db.execute(sql`SELECT 1`);
    });

  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        tags: ['ops'],
        summary: 'Liveness + DB reachability probe',
        response: {
          200: HealthOkSchema,
          503: HealthDegradedSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        await probe();
        return { status: 'ok' as const };
      } catch (err) {
        req.log.warn({ err }, 'health probe failed: db unreachable');
        return reply.code(503).send({
          status: 'degraded' as const,
          checks: { db: false },
        });
      }
    },
  );
};

export default healthRoutes;
