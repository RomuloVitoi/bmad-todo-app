import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  TodoSchema,
  CreateTodoRequestSchema,
  UpdateTodoRequestSchema,
  TodoListResponseSchema,
  ErrorResponseSchema,
} from './contracts.js';

const VALID_UUID = '00000000-0000-4000-8000-000000000000';
const VALID_ISO = '2026-04-19T22:17:57.864Z';

const validTodo = {
  id: VALID_UUID,
  text: 'buy milk',
  completed: false,
  createdAt: VALID_ISO,
};

describe('TodoSchema', () => {
  it('parses a valid todo', () => {
    assert.deepEqual(TodoSchema.parse(validTodo), validTodo);
  });

  it('throws on text longer than 500 chars', () => {
    assert.throws(
      () => TodoSchema.parse({ ...validTodo, text: 'x'.repeat(501) }),
      z.ZodError,
    );
  });

  it('throws on empty text', () => {
    assert.throws(() => TodoSchema.parse({ ...validTodo, text: '' }), z.ZodError);
  });

  it('throws on non-UUID id', () => {
    assert.throws(
      () => TodoSchema.parse({ ...validTodo, id: 'not-a-uuid' }),
      z.ZodError,
    );
  });

  it('throws on non-ISO createdAt', () => {
    assert.throws(
      () => TodoSchema.parse({ ...validTodo, createdAt: '2026-04-19' }),
      z.ZodError,
    );
  });

  it('throws on extra field due to .strict()', () => {
    assert.throws(
      () => TodoSchema.parse({ ...validTodo, extra: 1 }),
      z.ZodError,
    );
  });
});

describe('CreateTodoRequestSchema', () => {
  it('parses and trims input', () => {
    const result = CreateTodoRequestSchema.parse({ text: '  pick up milk  ' });
    assert.deepEqual(result, { text: 'pick up milk' });
  });

  it('throws on empty text', () => {
    assert.throws(() => CreateTodoRequestSchema.parse({ text: '' }), z.ZodError);
  });

  it('throws on text longer than 500 chars', () => {
    assert.throws(
      () => CreateTodoRequestSchema.parse({ text: 'x'.repeat(501) }),
      z.ZodError,
    );
  });

  it('throws on extra field due to .strict()', () => {
    assert.throws(
      () => CreateTodoRequestSchema.parse({ text: 'x', completed: true }),
      z.ZodError,
    );
  });
});

describe('UpdateTodoRequestSchema', () => {
  it('parses { completed: true }', () => {
    assert.deepEqual(UpdateTodoRequestSchema.parse({ completed: true }), {
      completed: true,
    });
  });

  it('parses { completed: false }', () => {
    assert.deepEqual(UpdateTodoRequestSchema.parse({ completed: false }), {
      completed: false,
    });
  });

  it('throws on extra-only field (no completed)', () => {
    assert.throws(
      () => UpdateTodoRequestSchema.parse({ text: 'x' }),
      z.ZodError,
    );
  });

  it('throws on extra field alongside completed', () => {
    assert.throws(
      () => UpdateTodoRequestSchema.parse({ completed: true, text: 'x' }),
      z.ZodError,
    );
  });

  it('throws on missing required completed', () => {
    assert.throws(() => UpdateTodoRequestSchema.parse({}), z.ZodError);
  });
});

describe('TodoListResponseSchema', () => {
  it('parses { todos: [] }', () => {
    assert.deepEqual(TodoListResponseSchema.parse({ todos: [] }), { todos: [] });
  });

  it('parses { todos: [validTodo] }', () => {
    assert.deepEqual(TodoListResponseSchema.parse({ todos: [validTodo] }), {
      todos: [validTodo],
    });
  });

  it('throws on missing todos key', () => {
    assert.throws(() => TodoListResponseSchema.parse({}), z.ZodError);
  });

  it('throws on null', () => {
    assert.throws(() => TodoListResponseSchema.parse(null), z.ZodError);
  });

  it('throws on nested invalid todo', () => {
    assert.throws(
      () =>
        TodoListResponseSchema.parse({
          todos: [{ ...validTodo, id: 'not-a-uuid' }],
        }),
      z.ZodError,
    );
  });
});

describe('ErrorResponseSchema', () => {
  it('parses without optional code', () => {
    const input = { statusCode: 404, error: 'Not Found', message: 'Not found' };
    assert.deepEqual(ErrorResponseSchema.parse(input), input);
  });

  it('parses with optional code', () => {
    const input = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    };
    assert.deepEqual(ErrorResponseSchema.parse(input), input);
  });

  it('throws on non-positive statusCode', () => {
    assert.throws(
      () =>
        ErrorResponseSchema.parse({ statusCode: -1, error: 'x', message: 'x' }),
      z.ZodError,
    );
  });

  it('throws on non-integer statusCode', () => {
    assert.throws(
      () =>
        ErrorResponseSchema.parse({ statusCode: 1.5, error: 'x', message: 'x' }),
      z.ZodError,
    );
  });

  it('throws on extra field due to .strict()', () => {
    assert.throws(
      () =>
        ErrorResponseSchema.parse({
          statusCode: 500,
          error: 'x',
          message: 'x',
          extra: 1,
        }),
      z.ZodError,
    );
  });
});
