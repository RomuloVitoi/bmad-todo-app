import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';

function errorResponse(
  statusCode: number,
  body?: unknown,
  headers: HeadersInit = {},
): Response {
  return new Response(
    body === undefined
      ? undefined
      : JSON.stringify(body ?? { statusCode, error: 'Error', message: 'x' }),
    { status: statusCode, headers },
  );
}

describe('ApiError.fromResponse()', () => {
  it('maps 400 to a human-readable message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'text must be at least 1 character',
      }),
    );
    expect(err.message).toBe("That change couldn't be saved.");
  });

  it('maps 404 to a human-readable message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(404, {
        statusCode: 404,
        error: 'Not Found',
        message: 'todo not found',
      }),
    );
    expect(err.message).toBe('This todo no longer exists.');
  });

  it('maps 429 to a human-readable message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(429, {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'rate limit exceeded',
      }),
    );
    expect(err.message).toBe('Too many requests — please wait a moment.');
  });

  it('maps 500 to the generic fallback message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(500, {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'database is unreachable',
      }),
    );
    expect(err.message).toBe('Something went wrong. Please try again.');
  });

  it('maps an unmapped status (e.g. 403) to the generic fallback message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(403, {
        statusCode: 403,
        error: 'Forbidden',
        message: 'nope',
      }),
    );
    expect(err.message).toBe('Something went wrong. Please try again.');
  });

  it('preserves .statusCode and .requestId regardless of the mapped message', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(
        503,
        { statusCode: 503, error: 'Service Unavailable', message: 'down' },
        { 'x-request-id': 'srv-correlation-xyz' },
      ),
    );
    expect(err.statusCode).toBe(503);
    expect(err.requestId).toBe('srv-correlation-xyz');
  });

  it('extracts .code from a well-formed ErrorResponseSchema body when present', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'text must be at least 1 character',
        code: 'VALIDATION_ERROR',
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('leaves .code undefined when the body does not match the envelope shape', async () => {
    const err = await ApiError.fromResponse(
      errorResponse(500, { wrong: 'shape' }),
    );
    expect(err.code).toBeUndefined();
  });

  it('leaves .code undefined when the body is missing/malformed JSON', async () => {
    const err = await ApiError.fromResponse(
      new Response('not json {', { status: 500 }),
    );
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('Something went wrong. Please try again.');
  });
});

describe('ApiError.networkFailure()', () => {
  it('returns statusCode 0, an offline message, and no requestId', () => {
    const err = ApiError.networkFailure();
    expect(err.statusCode).toBe(0);
    expect(err.message).toBe("You're offline. Your change wasn't saved.");
    expect(err.requestId).toBeUndefined();
    expect(err.name).toBe('ApiError');
  });
});
