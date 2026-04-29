import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(
  async (app) => {
    // v1 gate (architecture-aligned): docs are exposed unless NODE_ENV is
    // exactly the literal string 'production'. Spelling-strict — values like
    // 'Production' (capital P), 'staging', 'prod', or '' all leak /docs and
    // /docs/json. Explicit ENABLE_DOCS='true' overrides for prod testing.
    // Tighten to a whitelist (`'development' | 'test'`) in Story 1.11 once
    // the deploy target's NODE_ENV taxonomy is known.
    const enabled =
      app.config.NODE_ENV !== 'production' || app.config.ENABLE_DOCS === 'true';
    if (!enabled) return;

    await app.register(fastifySwagger, {
      openapi: {
        // fastify-type-provider-zod@^4 emits 3.0-flavoured JSON Schema
        // (`nullable: true`, no `type: ['null', ...]`). Declare 3.0.3 so the
        // doc's dialect matches its declared version. v6 of the type provider
        // would unlock 3.1, but requires Zod v4 in packages/shared.
        openapi: '3.0.3',
        info: {
          title: 'Todo API',
          version: '0.1.0',
          description:
            'REST API for the shared todo list. ' +
            'Concurrency: last-write-wins (LWW) — no ETag/If-Match.',
        },
        servers: [{ url: '/' }],
        // Top-level tag definitions — operations reference these by `name`
        // (`tags: ['todos']` / `['ops']` on each route schema). Without this
        // section, Swagger UI groups by alphabetical default with no
        // descriptions; with it, sections are ordered with explanatory copy.
        tags: [
          { name: 'todos', description: 'Todo items — list, create, complete, delete.' },
          { name: 'ops', description: 'Operational probes — liveness and DB reachability.' },
        ],
      },
      transform: jsonSchemaTransform,
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      staticCSP: true,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  },
  { name: 'swagger', dependencies: ['@fastify/env'] },
);
