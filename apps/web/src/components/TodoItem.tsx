'use client';

import * as Checkbox from '@radix-ui/react-checkbox';
import { useId } from 'react';
import type { TodoEntry } from '@/lib/reducer';

export interface TodoItemProps {
  todo: TodoEntry;
  onToggle: (id: string, nextCompleted: boolean) => void;
  onDelete: (id: string) => void;
}

export default function TodoItem({
  todo,
  onToggle,
  onDelete,
}: TodoItemProps) {
  const completed = todo.completed;
  const pending = todo.pending === true;
  const labelId = useId();

  const handleCheckedChange = (
    nextChecked: boolean | 'indeterminate',
  ): void => {
    const next = nextChecked === true;
    onToggle(todo.id, next);
  };

  const handleDeleteClick = (): void => {
    onDelete(todo.id);
  };

  return (
    <li
      data-testid="todo-item"
      data-completed={completed}
      className="flex items-start gap-3 rounded-md border border-current/10 px-4 py-3"
    >
      <Checkbox.Root
        data-testid="todo-item-checkbox"
        checked={completed}
        disabled={pending}
        onCheckedChange={handleCheckedChange}
        aria-labelledby={labelId}
        className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-current/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-current/20"
      >
        <Checkbox.Indicator
          data-testid="todo-item-checkbox-indicator"
          className="text-base leading-none"
        >
          <span aria-hidden="true">✓</span>
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span
        id={labelId}
        data-testid="todo-item-text"
        className={
          completed
            ? 'flex-1 break-words text-base leading-6 line-through opacity-60'
            : 'flex-1 break-words text-base leading-6'
        }
      >
        {todo.text}
      </span>
      <button
        type="button"
        data-testid="todo-item-delete"
        aria-label={`Delete: ${todo.text}`}
        disabled={pending}
        onClick={handleDeleteClick}
        className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current/10 bg-transparent outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}
