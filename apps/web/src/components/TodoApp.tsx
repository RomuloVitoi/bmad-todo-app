'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import {
  createTodo,
  deleteTodo,
  getTodos,
  updateTodo,
} from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { initialState, reducer } from '@/lib/reducer';
import Toast from './Toast';
import TodoInput from './TodoInput';
import TodoList from './TodoList';

export default function TodoApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [failedAdd, setFailedAdd] = useState<{
    tempId: string;
    text: string;
  } | null>(null);

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

  const handleRetry = useCallback((): void => {
    dispatch({ type: 'loadStart' });
    getTodos().then(
      (todos) => {
        dispatch({ type: 'loadSuccess', payload: todos });
      },
      (err: unknown) => {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Could not load todos. Please try again.';
        const requestId = err instanceof ApiError ? err.requestId : undefined;
        dispatch({ type: 'loadError', payload: { error: message, requestId } });
      },
    );
  }, []);

  const handleAdd = useCallback((text: string): string => {
    const tempId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    dispatch({ type: 'addOptimistic', payload: { tempId, text, createdAt } });
    createTodo(text).then(
      (todo) => {
        dispatch({ type: 'addReconcile', payload: { tempId, todo } });
      },
      (err: unknown) => {
        dispatch({ type: 'addFailed', payload: { tempId } });
        setFailedAdd({ tempId, text });
        const message =
          err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.';
        if (err instanceof ApiError) {
          console.debug('mutation failed', {
            requestId: err.requestId,
            statusCode: err.statusCode,
          });
        }
        dispatch({
          type: 'errorShown',
          payload: { message, id: crypto.randomUUID() },
        });
      },
    );
    return tempId;
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
        (err: unknown) => {
          dispatch({
            type: 'toggleFailed',
            payload: { id, previousCompleted },
          });
          const message =
            err instanceof ApiError
              ? err.message
              : 'Something went wrong. Please try again.';
          if (err instanceof ApiError) {
            console.debug('mutation failed', {
              requestId: err.requestId,
              statusCode: err.statusCode,
            });
          }
          dispatch({
            type: 'errorShown',
            payload: { message, id: crypto.randomUUID() },
          });
        },
      );
    },
    [state.status, state.todos],
  );

  const handleDelete = useCallback(
    (id: string): void => {
      if (state.status !== 'success') return;
      const index = state.todos.findIndex((t) => t.id === id);
      if (index === -1) return;
      const target = state.todos[index]!;
      if (target.pending === true) return;
      // Strip the `pending` flag — `deleteFailed.payload.todo` is typed as
      // the wire `Todo` (no `pending`); spreading `target` would smuggle
      // it back into a re-inserted entry.
      const previousTodo = {
        id: target.id,
        text: target.text,
        completed: target.completed,
        createdAt: target.createdAt,
      };

      dispatch({ type: 'deleteOptimistic', payload: { id } });
      deleteTodo(id).then(
        () => {
          // 204 success: the optimistic removal is now authoritative. No
          // dispatch needed — the row is already gone from state.
        },
        (err: unknown) => {
          dispatch({
            type: 'deleteFailed',
            payload: { todo: previousTodo, index },
          });
          const message =
            err instanceof ApiError
              ? err.message
              : 'Something went wrong. Please try again.';
          if (err instanceof ApiError) {
            console.debug('mutation failed', {
              requestId: err.requestId,
              statusCode: err.statusCode,
            });
          }
          dispatch({
            type: 'errorShown',
            payload: { message, id: crypto.randomUUID() },
          });
        },
      );
    },
    [state.status, state.todos],
  );

  return (
    <>
      <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
        <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
          Shared Todos
        </h1>
        {state.status === 'success' && (
          <TodoInput onAdd={handleAdd} failedAdd={failedAdd} />
        )}
        <TodoList
          state={state}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onRetry={handleRetry}
        />
      </section>
      <Toast
        toast={state.toast}
        onDismiss={() => dispatch({ type: 'errorDismiss' })}
      />
    </>
  );
}
