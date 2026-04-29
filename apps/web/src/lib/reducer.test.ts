import { describe, expect, it } from 'vitest';
import type { Todo } from '@todo-app/shared';
import { initialState, reducer, type TodoAction } from './reducer';

describe('initialState', () => {
  it('is { status: "idle", todos: [] }', () => {
    expect(initialState).toEqual({ status: 'idle', todos: [] });
  });
});

describe('reducer', () => {
  it('idle → loadStart → loading with empty todos', () => {
    const next = reducer(initialState, { type: 'loadStart' });
    expect(next).toEqual({ status: 'loading', todos: [] });
  });

  it('loading → loadSuccess → success with payload', () => {
    const todo: Todo = {
      id: '11111111-1111-4111-8111-111111111111',
      text: 'pick up milk',
      completed: false,
      createdAt: '2026-04-29T00:00:00.000Z',
    };
    const next = reducer(
      { status: 'loading', todos: [] },
      { type: 'loadSuccess', payload: [todo] },
    );
    expect(next).toEqual({ status: 'success', todos: [todo] });
  });

  it('loading → loadError → error with message and optional requestId', () => {
    const next = reducer(
      { status: 'loading', todos: [] },
      {
        type: 'loadError',
        payload: { error: 'Service unavailable', requestId: 'corr-abc' },
      },
    );
    expect(next).toEqual({
      status: 'error',
      todos: [],
      error: 'Service unavailable',
      requestId: 'corr-abc',
    });
  });

  it('loadError without requestId leaves the field undefined', () => {
    const next = reducer(initialState, {
      type: 'loadError',
      payload: { error: 'boom' },
    });
    expect(next.requestId).toBeUndefined();
  });

  it('returns the original state for an unrecognized action (defensive runtime fallback)', () => {
    const state = { status: 'success' as const, todos: [] };
    const next = reducer(state, { type: 'bogus' } as unknown as TodoAction);
    expect(next).toBe(state);
  });
});
