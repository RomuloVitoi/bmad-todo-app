import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/buildTestApp.js';

// Regression: @fastify/cors v11 narrowed its default Access-Control-Allow-Methods
// to 'GET,HEAD,POST'. PATCH (toggle) and DELETE silently broke under cross-origin
// preflight even though the routes existed. These assertions fail loudly if a
// future dependency bump or refactor drops PATCH/DELETE from the allow-list.
let app: FastifyInstance;

before(async () => {
  app = await buildTestApp();
});

after(async () => {
  await app.close();
});

function parseAllowedMethods(header: string | string[] | undefined): Set<string> {
  if (typeof header !== 'string') return new Set();
  return new Set(header.split(',').map((m) => m.trim().toUpperCase()));
}

test('CORS preflight for PATCH /todos/:id allows the method', async () => {
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/todos/00000000-0000-0000-0000-000000000000',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'content-type,x-request-id',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  const methods = parseAllowedMethods(res.headers['access-control-allow-methods']);
  assert.ok(methods.has('PATCH'), `expected PATCH in allow-methods, got: ${[...methods].join(',')}`);
});

test('CORS preflight for DELETE /todos/:id allows the method', async () => {
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/todos/00000000-0000-0000-0000-000000000000',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'DELETE',
      'access-control-request-headers': 'x-request-id',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  const methods = parseAllowedMethods(res.headers['access-control-allow-methods']);
  assert.ok(methods.has('DELETE'), `expected DELETE in allow-methods, got: ${[...methods].join(',')}`);
});
