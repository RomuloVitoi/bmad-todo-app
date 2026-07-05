import type { TodoState } from '@/lib/reducer';
import TodoItem from './TodoItem';

export interface TodoListProps {
  state: TodoState;
  onToggle: (id: string, nextCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}

export default function TodoList({
  state,
  onToggle,
  onDelete,
  onRetry,
}: TodoListProps) {
  const { status, todos, error } = state;

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        data-testid="todo-list-loading"
        data-status={status}
        aria-live="polite"
        aria-busy="true"
        className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
      >
        Loading todos…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        data-testid="todo-list-error"
        data-status="error"
        role="alert"
        className="flex flex-col items-center gap-3 rounded-md border border-current/10 px-4 py-8 text-center text-sm"
      >
        <p className="font-medium">{"Couldn't load todos"}</p>
        {error !== undefined && (
          <p data-testid="todo-list-error-detail" className="opacity-70">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-md border border-current/10 px-4 text-sm font-medium outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status !== 'success') {
    // Compile-time exhaustiveness: adding a `LoadStatus` variant without a
    // matching branch above narrows `status` away from `never` here and fails
    // `tsc --noEmit`. Mirrors the reducer's `_exhaustive: never` pin.
    const _exhaustive: never = status;
    void _exhaustive;
    return null;
  }

  if (todos.length === 0) {
    return (
      <p
        data-testid="todo-list-empty"
        data-status="success"
        className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
      >
        No todos yet.
      </p>
    );
  }

  return (
    <ul
      data-testid="todo-list"
      data-status="success"
      className="flex flex-col gap-2"
    >
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
