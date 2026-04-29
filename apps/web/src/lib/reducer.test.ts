import { describe, expect, it } from 'vitest';
import type { Todo } from '@todo-app/shared';
import { initialState, reducer, type TodoAction, type TodoEntry, type TodoState } from './reducer';

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

// ---------------------------------------------------------------------------
// Story 2.4: optimistic mutations
// ---------------------------------------------------------------------------

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: '11111111-1111-4111-8111-111111111111',
  text: 'sample',
  completed: false,
  createdAt: '2026-04-29T00:00:00.000Z',
  ...over,
});

const successState = (todos: TodoEntry[]): TodoState => ({ status: 'success', todos });

describe('reducer (optimistic mutations)', () => {
  describe('addOptimistic', () => {
    it('appends a TodoEntry with pending: true and the supplied tempId/text/createdAt', () => {
      const next = reducer(successState([]), {
        type: 'addOptimistic',
        payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
      });
      expect(next.todos).toEqual([
        {
          id: 't-1',
          text: 'milk',
          completed: false,
          createdAt: '2026-04-29T12:00:00.000Z',
          pending: true,
        },
      ]);
      expect(next.status).toBe('success');
    });

    it('appends to the END of the todos array (chronological, oldest-first)', () => {
      const existing: TodoEntry = todo({ id: 'a', text: 'first' });
      const next = reducer(successState([existing]), {
        type: 'addOptimistic',
        payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
      });
      expect(next.todos).toHaveLength(2);
      expect(next.todos[0]).toBe(existing);
      expect(next.todos[1]!.id).toBe('t-1');
    });

    it('is a no-op when state.status is not success (returns same reference)', () => {
      const loading: TodoState = { status: 'loading', todos: [] };
      const next = reducer(loading, {
        type: 'addOptimistic',
        payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T12:00:00.000Z' },
      });
      expect(next).toBe(loading);
    });
  });

  describe('addReconcile', () => {
    it('replaces the tempId entry with the server todo, in place', () => {
      const optimistic: TodoEntry = {
        id: 't-1',
        text: 'milk',
        completed: false,
        createdAt: '2026-04-29T12:00:00.000Z',
        pending: true,
      };
      const other: TodoEntry = todo({ id: 'a', text: 'before' });
      const serverTodo = todo({
        id: 's-99',
        text: 'milk',
        createdAt: '2026-04-29T12:00:01.000Z',
      });
      const next = reducer(successState([other, optimistic]), {
        type: 'addReconcile',
        payload: { tempId: 't-1', todo: serverTodo },
      });
      expect(next.todos).toHaveLength(2);
      expect(next.todos[0]).toBe(other);
      expect(next.todos[1]).toBe(serverTodo);
    });

    it('reconciled entry has NO `pending` flag (key absent, not just undefined)', () => {
      const optimistic: TodoEntry = {
        id: 't-1',
        text: 'milk',
        completed: false,
        createdAt: '2026-04-29T12:00:00.000Z',
        pending: true,
      };
      const serverTodo = todo({ id: 's-99', text: 'milk' });
      const next = reducer(successState([optimistic]), {
        type: 'addReconcile',
        payload: { tempId: 't-1', todo: serverTodo },
      });
      expect(next.todos[0]).not.toHaveProperty('pending');
    });

    it('is a no-op when tempId is not found (returns same reference)', () => {
      const state = successState([todo({ id: 'a' })]);
      const next = reducer(state, {
        type: 'addReconcile',
        payload: { tempId: 'unknown', todo: todo({ id: 's-99' }) },
      });
      expect(next).toBe(state);
    });
  });

  describe('addFailed', () => {
    it('removes the tempId entry from state', () => {
      const optimistic: TodoEntry = {
        id: 't-1',
        text: 'milk',
        completed: false,
        createdAt: '2026-04-29T12:00:00.000Z',
        pending: true,
      };
      const other: TodoEntry = todo({ id: 'a' });
      const next = reducer(successState([other, optimistic]), {
        type: 'addFailed',
        payload: { tempId: 't-1' },
      });
      expect(next.todos).toEqual([other]);
    });

    it('is a no-op when tempId is not found (returns same reference)', () => {
      const state = successState([todo({ id: 'a' })]);
      const next = reducer(state, { type: 'addFailed', payload: { tempId: 'unknown' } });
      expect(next).toBe(state);
    });
  });

  describe('toggleOptimistic / toggleFailed', () => {
    it('toggleOptimistic flips completed and leaves other todos untouched', () => {
      const a: TodoEntry = todo({ id: 'a', completed: false });
      const b: TodoEntry = todo({ id: 'b', completed: false });
      const next = reducer(successState([a, b]), {
        type: 'toggleOptimistic',
        payload: { id: 'a', completed: true },
      });
      expect(next.todos[0]!.completed).toBe(true);
      expect(next.todos[1]).toBe(b);
    });

    it('toggleOptimistic preserves other fields (id, text, createdAt) on the toggled todo', () => {
      const a: TodoEntry = todo({
        id: 'a',
        text: 'walk dog',
        createdAt: '2026-04-29T08:00:00.000Z',
        completed: false,
      });
      const next = reducer(successState([a]), {
        type: 'toggleOptimistic',
        payload: { id: 'a', completed: true },
      });
      expect(next.todos[0]).toEqual({
        id: 'a',
        text: 'walk dog',
        createdAt: '2026-04-29T08:00:00.000Z',
        completed: true,
      });
    });

    it('toggleFailed reverts to previousCompleted', () => {
      const a: TodoEntry = todo({ id: 'a', completed: true });
      const next = reducer(successState([a]), {
        type: 'toggleFailed',
        payload: { id: 'a', previousCompleted: false },
      });
      expect(next.todos[0]!.completed).toBe(false);
    });

    it('toggleOptimistic is a no-op when target is already at the requested value', () => {
      const a: TodoEntry = todo({ id: 'a', completed: true });
      const state = successState([a]);
      const next = reducer(state, {
        type: 'toggleOptimistic',
        payload: { id: 'a', completed: true },
      });
      expect(next).toBe(state);
    });

    it('toggle actions are no-ops when id is not found', () => {
      const state = successState([todo({ id: 'a' })]);
      expect(
        reducer(state, { type: 'toggleOptimistic', payload: { id: 'x', completed: true } }),
      ).toBe(state);
      expect(
        reducer(state, {
          type: 'toggleFailed',
          payload: { id: 'x', previousCompleted: false },
        }),
      ).toBe(state);
    });
  });

  describe('deleteOptimistic / deleteFailed', () => {
    it('deleteOptimistic removes the matching entry; others remain in place', () => {
      const a: TodoEntry = todo({ id: 'a' });
      const b: TodoEntry = todo({ id: 'b' });
      const c: TodoEntry = todo({ id: 'c' });
      const next = reducer(successState([a, b, c]), {
        type: 'deleteOptimistic',
        payload: { id: 'b' },
      });
      expect(next.todos).toEqual([a, c]);
    });

    it('deleteFailed re-inserts the stashed todo at the original index', () => {
      const a: TodoEntry = todo({ id: 'a' });
      const c: TodoEntry = todo({ id: 'c' });
      const stashed: Todo = todo({ id: 'b', text: 'restored' });
      const next = reducer(successState([a, c]), {
        type: 'deleteFailed',
        payload: { todo: stashed, index: 1 },
      });
      expect(next.todos).toEqual([a, stashed, c]);
      expect(next.todos[1]).toBe(stashed);
    });

    it('deleteFailed clamps index when out of bounds (defensive against concurrent deletes)', () => {
      const a: TodoEntry = todo({ id: 'a' });
      const stashed: Todo = todo({ id: 'b' });
      const next = reducer(successState([a]), {
        type: 'deleteFailed',
        payload: { todo: stashed, index: 99 },
      });
      expect(next.todos).toEqual([a, stashed]);
    });

    it('deleteFailed clamps negative index to 0', () => {
      const a: TodoEntry = todo({ id: 'a' });
      const stashed: Todo = todo({ id: 'b' });
      const next = reducer(successState([a]), {
        type: 'deleteFailed',
        payload: { todo: stashed, index: -1 },
      });
      expect(next.todos).toEqual([stashed, a]);
    });

    it('deleteOptimistic is a no-op when id is not found', () => {
      const state = successState([todo({ id: 'a' })]);
      expect(reducer(state, { type: 'deleteOptimistic', payload: { id: 'x' } })).toBe(state);
    });
  });

  describe('non-success state guard (AC #11)', () => {
    it.each(['idle', 'loading', 'error'] as const)(
      'all seven optimistic actions are no-ops when status === "%s" (return same reference)',
      (status) => {
        const state: TodoState = { status, todos: [] };
        const actions: TodoAction[] = [
          {
            type: 'addOptimistic',
            payload: { tempId: 't', text: 'x', createdAt: '2026-04-29T00:00:00.000Z' },
          },
          { type: 'addReconcile', payload: { tempId: 't', todo: todo() } },
          { type: 'addFailed', payload: { tempId: 't' } },
          { type: 'toggleOptimistic', payload: { id: 'x', completed: true } },
          { type: 'toggleFailed', payload: { id: 'x', previousCompleted: false } },
          { type: 'deleteOptimistic', payload: { id: 'x' } },
          { type: 'deleteFailed', payload: { todo: todo(), index: 0 } },
        ];
        for (const action of actions) {
          expect(reducer(state, action)).toBe(state);
        }
      },
    );
  });

  describe('shape parity (AC #2: "visually indistinguishable except for pending")', () => {
    it('addReconcile produces an entry structurally identical to a server-loaded Todo', () => {
      const serverTodo = todo({ id: 's-99', text: 'milk', completed: false });
      // Path 1: added optimistically, then reconciled
      let s = successState([]);
      s = reducer(s, {
        type: 'addOptimistic',
        payload: { tempId: 't-1', text: 'milk', createdAt: '2026-04-29T00:00:00.000Z' },
      });
      s = reducer(s, { type: 'addReconcile', payload: { tempId: 't-1', todo: serverTodo } });
      // Path 2: loaded fresh from the server
      const loaded = reducer(successState([]), {
        type: 'loadSuccess',
        payload: [serverTodo],
      });
      expect(s.todos[0]).toEqual(loaded.todos[0]);
      expect(s.todos[0]).not.toHaveProperty('pending');
      expect(loaded.todos[0]).not.toHaveProperty('pending');
    });
  });
});
