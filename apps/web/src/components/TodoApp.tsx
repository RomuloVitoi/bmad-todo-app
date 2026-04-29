'use client';

import { useEffect, useReducer } from 'react';
import { getTodos } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { initialState, reducer } from '@/lib/reducer';
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

  return (
    <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
      <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
        Shared Todos
      </h1>
      <TodoList state={state} />
    </section>
  );
}
