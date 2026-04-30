import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Todo } from '@todo-app/shared';
import type { TodoState } from '@/lib/reducer';
import TodoList from './TodoList';

const todoA: Todo = {
  id: '11111111-1111-4111-8111-111111111111',
  text: 'first',
  completed: false,
  createdAt: '2026-04-29T00:00:00.000Z',
};
const todoB: Todo = {
  id: '22222222-2222-4222-8222-222222222222',
  text: 'second',
  completed: true,
  createdAt: '2026-04-29T00:00:01.000Z',
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('<TodoList />', () => {
  it('renders the loading branch with aria-live="polite" and aria-busy when status is "loading"', () => {
    const state: TodoState = { status: 'loading', todos: [] };
    render(<TodoList state={state} onToggle={vi.fn()} />);
    const region = screen.getByTestId('todo-list-loading');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveTextContent(/loading/i);
  });

  it('renders the loading branch when status is "idle" (pre-mount window)', () => {
    const state: TodoState = { status: 'idle', todos: [] };
    render(<TodoList state={state} onToggle={vi.fn()} />);
    expect(screen.getByTestId('todo-list-loading')).toHaveAttribute(
      'data-status',
      'idle',
    );
  });

  it('renders the empty-state with semantic <p> when status is "success" and todos is empty', () => {
    const state: TodoState = { status: 'success', todos: [] };
    render(<TodoList state={state} onToggle={vi.fn()} />);
    const empty = screen.getByTestId('todo-list-empty');
    expect(empty.tagName).toBe('P');
    expect(empty).toHaveTextContent(/no todos/i);
  });

  it('renders a <ul> of <TodoItem>s, one per todo, with stable keys', () => {
    const state: TodoState = { status: 'success', todos: [todoA, todoB] };
    render(<TodoList state={state} onToggle={vi.fn()} />);
    const list = screen.getByTestId('todo-list');
    expect(list.tagName).toBe('UL');
    const items = within(list).getAllByTestId('todo-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('first');
    expect(items[0]).toHaveAttribute('data-completed', 'false');
    expect(items[1]).toHaveTextContent('second');
    expect(items[1]).toHaveAttribute('data-completed', 'true');
  });

  it('renders the error placeholder with role="alert" when status is "error" (Epic 3 will replace)', () => {
    const state: TodoState = {
      status: 'error',
      todos: [],
      error: 'Service unavailable',
      requestId: 'corr-abc',
    };
    render(<TodoList state={state} onToggle={vi.fn()} />);
    const err = screen.getByTestId('todo-list-error');
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveTextContent(/failed to load/i);
  });
});
