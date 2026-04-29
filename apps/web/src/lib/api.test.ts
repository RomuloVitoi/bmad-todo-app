import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// api.ts reads NEXT_PUBLIC_API_URL at module load. vi.stubEnv MUST run before
// the dynamic import inside each test, and vi.resetModules() forces a fresh
// evaluation each time.
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mockFetchOnce(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));
}

describe('getTodos()', () => {
  it('issues GET with x-request-id and returns the parsed todos array on 200', async () => {
    const todo = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'pick up milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    mockFetchOnce(
      new Response(JSON.stringify({ todos: [todo] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { getTodos } = await import('./api');
    const result = await getTodos();
    expect(result).toEqual([todo]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/todos',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
        }),
      }),
    );
  });

  it('throws an ApiError carrying status, message, and requestId when the server returns a non-OK envelope', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'database is unreachable',
        }),
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'srv-correlation-xyz',
          },
        },
      ),
    );
    const { getTodos } = await import('./api');
    await expect(getTodos()).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 503,
      message: 'database is unreachable',
      requestId: 'srv-correlation-xyz',
    });
  });

  it('throws when the 200 body fails TodoListResponseSchema parsing (server contract drift)', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ wrong: 'shape', not_todos: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { getTodos } = await import('./api');
    await expect(getTodos()).rejects.toThrow();
  });
});
