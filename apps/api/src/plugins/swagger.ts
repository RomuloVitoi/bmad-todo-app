import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(
  async (app) => {
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
