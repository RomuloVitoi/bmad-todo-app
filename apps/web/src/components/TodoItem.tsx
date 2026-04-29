import type { Todo } from '@todo-app/shared';

export interface TodoItemProps {
  todo: Todo;
}

export default function TodoItem({ todo }: TodoItemProps) {
  const completed = todo.completed;
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- Epic 1 read-only signal; Story 2.6 replaces with Radix Checkbox role="checkbox"
    <li
      data-testid="todo-item"
      data-completed={completed}
      aria-checked={completed}
      role="listitem"
      className="flex items-start gap-3 rounded-md border border-current/10 px-4 py-3"
    >
      <span
        aria-hidden="true"
        className={
          completed
            ? 'mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current bg-current/20'
            : 'mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current'
        }
      />
      <span
        className={
          completed
            ? 'flex-1 break-words text-base leading-6 line-through opacity-60'
            : 'flex-1 break-words text-base leading-6'
        }
      >
        {todo.text}
      </span>
    </li>
  );
}
