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
      message: 'Something went wrong. Please try again.',
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

  it('throws ApiError when the 200 body is malformed JSON', async () => {
    mockFetchOnce(
      new Response('not json {', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { getTodos } = await import('./api');
    await expect(getTodos()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Malformed JSON in successful response',
    });
  });
});

describe('createTodo()', () => {
  it('issues POST with x-request-id, content-type, and JSON body containing the supplied text verbatim', async () => {
    const todo = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'buy milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    mockFetchOnce(
      new Response(JSON.stringify(todo), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { createTodo } = await import('./api');
    const result = await createTodo('buy milk');
    expect(result).toEqual(todo);

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/todos');
    expect(init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
      body: JSON.stringify({ text: 'buy milk' }),
    });
  });

  it('preserves whitespace verbatim in the request body (server is the trim authority)', async () => {
    const todo = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'buy milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    mockFetchOnce(new Response(JSON.stringify(todo), { status: 201 }));
    const { createTodo } = await import('./api');
    await createTodo('  buy milk  ');
    const fetchMock = vi.mocked(globalThis.fetch);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBe(JSON.stringify({ text: '  buy milk  ' }));
  });

  it('throws ApiError with status, message, and requestId when the server returns a non-OK envelope', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 400,
          error: 'Bad Request',
          message: 'text must be at least 1 character',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'srv-abc',
          },
        },
      ),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 400,
      message: "That change couldn't be saved.",
      requestId: 'srv-abc',
    });
  });

  it('throws ApiError with requestId === undefined when the server omits the x-request-id header', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'oops',
        }),
        { status: 500 },
      ),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('x')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 500,
      requestId: undefined,
    });
  });

  it('throws ApiError when the 201 body fails TodoSchema parsing (server contract drift)', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ id: 'not-a-uuid', text: 'x' }), {
        status: 201,
      }),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('x')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Response did not match the expected todo schema',
    });
  });

  it('throws ApiError when the 201 body is malformed JSON', async () => {
    mockFetchOnce(
      new Response('not json {', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('x')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Malformed JSON in successful response',
    });
  });

  it('throws ApiError with the mapped 429 message when the server rate-limits', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'rate limit exceeded',
        }),
        { status: 429 },
      ),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('x')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 429,
      message: 'Too many requests — please wait a moment.',
    });
  });

  it('throws ApiError with statusCode 0 and an offline message when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const { createTodo } = await import('./api');
    await expect(createTodo('x')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 0,
      message: "You're offline. Your change wasn't saved.",
    });
  });
});

describe('updateTodo()', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('issues PATCH /todos/:id with x-request-id, content-type, and JSON body { completed: true }', async () => {
    const todo = {
      id,
      text: 'pick up milk',
      completed: true,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    mockFetchOnce(
      new Response(JSON.stringify(todo), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { updateTodo } = await import('./api');
    const result = await updateTodo(id, true);
    expect(result).toEqual(todo);

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:4000/todos/${id}`);
    expect(init).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
      body: JSON.stringify({ completed: true }),
    });
  });

  it('issues body { completed: false } when un-completing', async () => {
    const todo = {
      id,
      text: 'pick up milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    mockFetchOnce(new Response(JSON.stringify(todo), { status: 200 }));
    const { updateTodo } = await import('./api');
    await updateTodo(id, false);
    const fetchMock = vi.mocked(globalThis.fetch);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBe(JSON.stringify({ completed: false }));
  });

  it('throws ApiError with status, message, and requestId when the server returns 404', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 404,
          error: 'Not Found',
          message: 'todo not found',
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'srv-not-found',
          },
        },
      ),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 404,
      message: 'This todo no longer exists.',
      requestId: 'srv-not-found',
    });
  });

  it('throws ApiError with requestId === undefined when the server omits the x-request-id header on 500', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'oops',
        }),
        { status: 500 },
      ),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 500,
      requestId: undefined,
    });
  });

  it('throws ApiError when the 200 body fails TodoSchema parsing (server contract drift)', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ id: 'not-a-uuid', text: 'x' }), {
        status: 200,
      }),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Response did not match the expected todo schema',
    });
  });

  it('throws ApiError when the 200 body is malformed JSON', async () => {
    mockFetchOnce(
      new Response('not json {', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Malformed JSON in successful response',
    });
  });

  it('throws ApiError with the mapped 429 message when the server rate-limits', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'rate limit exceeded',
        }),
        { status: 429 },
      ),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 429,
      message: 'Too many requests — please wait a moment.',
    });
  });

  it('throws ApiError with statusCode 0 and an offline message when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const { updateTodo } = await import('./api');
    await expect(updateTodo(id, true)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 0,
      message: "You're offline. Your change wasn't saved.",
    });
  });
});

describe('deleteTodo()', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('issues DELETE /todos/:id with x-request-id and no body, resolves to undefined on 204', async () => {
    // 204 response: empty body, no content-type. Calling .json() on this
    // would throw SyntaxError — the test proves the function does not.
    mockFetchOnce(new Response(null, { status: 204 }));
    const { deleteTodo } = await import('./api');
    const result = await deleteTodo(id);
    expect(result).toBeUndefined();

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:4000/todos/${id}`);
    expect(init).toMatchObject({
      method: 'DELETE',
      headers: expect.objectContaining({
        accept: 'application/json',
        'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
    });
    expect(init?.body).toBeUndefined();
  });

  it('does NOT set a content-type header on DELETE (no body to type)', async () => {
    mockFetchOnce(new Response(null, { status: 204 }));
    const { deleteTodo } = await import('./api');
    await deleteTodo(id);
    const fetchMock = vi.mocked(globalThis.fetch);
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBeUndefined();
  });

  it('throws ApiError with status, message, and requestId when the server returns 404', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 404,
          error: 'Not Found',
          message: 'todo not found',
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'srv-not-found',
          },
        },
      ),
    );
    const { deleteTodo } = await import('./api');
    await expect(deleteTodo(id)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 404,
      message: 'This todo no longer exists.',
      requestId: 'srv-not-found',
    });
  });

  it('throws ApiError with requestId === undefined when the server omits the x-request-id header on 500', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'oops',
        }),
        { status: 500 },
      ),
    );
    const { deleteTodo } = await import('./api');
    await expect(deleteTodo(id)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 500,
      requestId: undefined,
    });
  });

  it('throws ApiError on 400 (bad UUID per server validation)', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 400,
          error: 'Bad Request',
          message: 'params/id Invalid uuid',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const { deleteTodo } = await import('./api');
    await expect(deleteTodo('not-a-uuid')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 400,
    });
  });

  it('throws ApiError with the mapped 429 message when the server rate-limits', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'rate limit exceeded',
        }),
        { status: 429 },
      ),
    );
    const { deleteTodo } = await import('./api');
    await expect(deleteTodo(id)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 429,
      message: 'Too many requests — please wait a moment.',
    });
  });

  it('throws ApiError with statusCode 0 and an offline message when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const { deleteTodo } = await import('./api');
    await expect(deleteTodo(id)).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 0,
      message: "You're offline. Your change wasn't saved.",
    });
  });
});
