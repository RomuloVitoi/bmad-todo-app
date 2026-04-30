'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { createTodo, getTodos, updateTodo } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { initialState, reducer } from '@/lib/reducer';
import TodoInput from './TodoInput';
import TodoList from './TodoList';

export default function TodoApp() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    dispatch({ type: 'loadStart' });
    getTodos(controller.signal).then(
      (todos) => {
        if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
      },
      (err) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const message =
          err instanceof ApiError
            ? err.message
            : 'Could not load todos. Please try again.';
        const requestId = err instanceof ApiError ? err.requestId : undefined;
        dispatch({ type: 'loadError', payload: { error: message, requestId } });
      },
    );

    // Best-effort refetch on tab visibility regain. Fails SILENTLY (log only,
    // no state transition to 'error') per Architecture §Retry.
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      getTodos(controller.signal).then(
        (todos) => {
          if (!cancelled) dispatch({ type: 'loadSuccess', payload: todos });
        },
        (err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.warn('todos refetch failed (silent)', err);
        },
      );
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleAdd = useCallback((text: string): void => {
    const tempId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
    createTodo(text).then(
      (todo) => {
        dispatch({ type: 'addReconcile', payload: { tempId, todo } });
      },
      () => {
        dispatch({ type: 'addFailed', payload: { tempId } });
      },
    );
  }, []);

  const handleToggle = useCallback(
    (id: string, nextCompleted: boolean): void => {
      if (state.status !== 'success') return;
      const target = state.todos.find((t) => t.id === id);
      if (!target) return;
      if (target.pending === true) return;
      const previousCompleted = target.completed;

      dispatch({
        type: 'toggleOptimistic',
        payload: { id, completed: nextCompleted },
      });
      updateTodo(id, nextCompleted).then(
        (todo) => {
          dispatch({
            type: 'addReconcile',
            payload: { tempId: id, todo },
          });
        },
        () => {
          dispatch({
            type: 'toggleFailed',
            payload: { id, previousCompleted },
          });
        },
      );
    },
    [state.status, state.todos],
  );

  return (
    <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
      <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
        Shared Todos
      </h1>
      {state.status === 'success' && <TodoInput onAdd={handleAdd} />}
      <TodoList state={state} onToggle={handleToggle} />
    </section>
  );
}
