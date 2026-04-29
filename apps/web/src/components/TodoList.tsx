import type { TodoState } from '@/lib/reducer';
import TodoItem from './TodoItem';

export interface TodoListProps {
  state: TodoState;
}

export default function TodoList({ state }: TodoListProps) {
  const { status, todos } = state;

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
    // EPIC 1 PLACEHOLDER — Story 3.1 replaces this with the Radix Toast-based
    // error system; the minimal text here keeps the page functional without
    // pre-empting Epic 3's UX choices.
    return (
      <div
        data-testid="todo-list-error"
        data-status="error"
        role="alert"
        className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
      >
        Failed to load todos.
      </div>
    );
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
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
