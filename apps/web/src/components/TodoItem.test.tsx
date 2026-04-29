import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Todo } from '@todo-app/shared';
import TodoItem from './TodoItem';

const baseTodo: Todo = {
  id: '11111111-1111-4111-8111-111111111111',
  text: 'pick up milk',
  completed: false,
  createdAt: '2026-04-29T00:00:00.000Z',
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

describe('<TodoItem />', () => {
  it('renders an active todo with default visual treatment', () => {
    render(<TodoItem todo={baseTodo} />);
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveTextContent('pick up milk');
    expect(li).toHaveAttribute('data-completed', 'false');
    expect(li).toHaveAttribute('aria-checked', 'false');
    const text = li.querySelector('span:last-child');
    expect(text).not.toHaveClass('line-through');
  });

  it('renders a completed todo with strikethrough and aria-checked=true', () => {
    render(<TodoItem todo={{ ...baseTodo, completed: true }} />);
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveAttribute('data-completed', 'true');
    expect(li).toHaveAttribute('aria-checked', 'true');
    const text = li.querySelector('span:last-child');
    expect(text).toHaveClass('line-through');
  });

  it('renders the todo text verbatim (no escaping shenanigans, NFR17 React JSX)', () => {
    const xss: Todo = {
      ...baseTodo,
      text: '<script>alert("x")</script>',
    };
    render(<TodoItem todo={xss} />);
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveTextContent('<script>alert("x")</script>');
    expect(li.querySelector('script')).toBeNull();
  });

  it('exposes NO interactive affordances (no buttons, no inputs, no role="button")', () => {
    render(<TodoItem todo={baseTodo} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('handles a 500-char text without horizontal overflow class violations (break-words present)', () => {
    const longText: Todo = { ...baseTodo, text: 'a'.repeat(500) };
    render(<TodoItem todo={longText} />);
    const text = screen.getByTestId('todo-item').querySelector('span:last-child');
    expect(text).toHaveClass('break-words');
  });
});
