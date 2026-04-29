import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { FastifyInstance } from 'fastify';
import {
  buildProductionTestApp,
  buildTestApp,
} from './helpers/buildTestApp.js';

let app: FastifyInstance;

before(async () => {
  app = await buildTestApp();
});

after(async () => {
  await app.close();
});

test('AC #3: GET /docs/json returns the OpenAPI document with /todos and /health paths', async () => {
  const res = await app.inject({ method: 'GET', url: '/docs/json' });
  assert.equal(res.statusCode, 200);
  const doc = res.json() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
  };

  assert.equal(doc.openapi, '3.0.3');
  assert.ok(doc.paths['/todos'], 'expected /todos to appear in the spec');
  assert.ok(doc.paths['/health'], 'expected /health to appear in the spec');

  const todosGet = doc.paths['/todos'].get as {
    responses: { '200': { content: { 'application/json': { schema: { properties: { todos: unknown } } } } } };
  };
  const todosSchema = todosGet.responses['200'].content['application/json'].schema;
  assert.ok(
    todosSchema.properties.todos,
    'expected GET /todos response to contain a `todos` property derived from TodoListResponseSchema',
  );
});

test('AC #5: the OpenAPI document validates with @apidevtools/swagger-parser', async () => {
  const res = await app.inject({ method: 'GET', url: '/docs/json' });
  const doc = res.json();
  // Throws on invalid; returns the dereferenced document on success.
  await SwaggerParser.validate(doc as Parameters<typeof SwaggerParser.validate>[0]);
});

test('AC #3: GET /docs serves the Swagger UI HTML page in non-production', async () => {
  const res = await app.inject({ method: 'GET', url: '/docs/' });
  assert.equal(res.statusCode, 200);
  const contentType = res.headers['content-type'] as string;
  assert.match(contentType, /text\/html/);
});

test('AC #4: GET /docs returns 404 in production without ENABLE_DOCS', async () => {
  const prodApp = await buildProductionTestApp();
  try {
    const res = await prodApp.inject({ method: 'GET', url: '/docs' });
    assert.equal(res.statusCode, 404);
    const jsonRes = await prodApp.inject({ method: 'GET', url: '/docs/json' });
    assert.equal(jsonRes.statusCode, 404);

    // Body must NOT leak schema details through fastify-sensible's 404 envelope.
    // Either response is allowed to be the standard `{ statusCode, error, message }`
    // 404 shape, but it must contain no OpenAPI document keys.
    const docsBody = res.json() as Record<string, unknown>;
    const jsonBody = jsonRes.json() as Record<string, unknown>;
    for (const body of [docsBody, jsonBody]) {
      assert.ok(!('openapi' in body), '404 body must not contain `openapi` key');
      assert.ok(!('paths' in body), '404 body must not contain `paths` key');
      assert.ok(!('components' in body), '404 body must not contain `components` key');
    }
  } finally {
    await prodApp.close();
  }
});
