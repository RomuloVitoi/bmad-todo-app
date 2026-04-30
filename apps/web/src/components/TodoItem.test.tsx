import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TodoEntry } from '@/lib/reducer';
import TodoItem from './TodoItem';

const baseTodo: TodoEntry = {
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
  it('renders an active todo with default visual treatment and aria-checked=false on the checkbox', () => {
    render(
      <TodoItem todo={baseTodo} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveAttribute('data-completed', 'false');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    const text = screen.getByTestId('todo-item-text');
    expect(text).toHaveTextContent('pick up milk');
    expect(text).not.toHaveClass('line-through');
  });

  it('renders a completed todo with strikethrough and aria-checked=true on the checkbox', () => {
    render(
      <TodoItem
        todo={{ ...baseTodo, completed: true }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveAttribute('data-completed', 'true');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    const text = screen.getByTestId('todo-item-text');
    expect(text).toHaveClass('line-through');
  });

  it('renders the todo text verbatim (no escaping shenanigans, NFR17 React JSX)', () => {
    const xss: TodoEntry = {
      ...baseTodo,
      text: '<script>alert("x")</script>',
    };
    render(<TodoItem todo={xss} onToggle={vi.fn()} onDelete={vi.fn()} />);
    const li = screen.getByTestId('todo-item');
    expect(li).toHaveTextContent('<script>alert("x")</script>');
    expect(li.querySelector('script')).toBeNull();
  });

  it('exposes a checkbox role for the row and labels it with the todo text', () => {
    render(
      <TodoItem todo={baseTodo} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'pick up milk' });
    expect(checkbox).toBeInTheDocument();
  });

  it('handles a 500-char text without horizontal overflow class violations (break-words present)', () => {
    const longText: TodoEntry = { ...baseTodo, text: 'a'.repeat(500) };
    render(
      <TodoItem todo={longText} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    const text = screen.getByTestId('todo-item-text');
    expect(text).toHaveClass('break-words');
  });

  it('calls onToggle(id, true) when the checkbox is clicked on an active todo', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={onToggle} onDelete={vi.fn()} />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(baseTodo.id, true);
  });

  it('calls onToggle(id, false) when the checkbox is clicked on a completed todo', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem
        todo={{ ...baseTodo, completed: true }}
        onToggle={onToggle}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(baseTodo.id, false);
  });

  it('calls onToggle when Space is pressed with the checkbox focused', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={onToggle} onDelete={vi.fn()} />,
    );
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(baseTodo.id, true);
  });

  it('does NOT call onToggle when Enter is pressed with the checkbox focused', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={onToggle} onDelete={vi.fn()} />,
    );
    screen.getByRole('checkbox').focus();
    await user.keyboard('{Enter}');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders the checkbox as disabled when todo.pending === true and does NOT call onToggle on click', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem
        todo={{ ...baseTodo, pending: true }}
        onToggle={onToggle}
        onDelete={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders a delete button with an aria-label that includes the todo text', () => {
    render(
      <TodoItem todo={baseTodo} onToggle={vi.fn()} onDelete={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: /^delete:/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Delete: pick up milk');
  });

  it('renders the delete button on completed todos as well as active ones (FR4)', () => {
    render(
      <TodoItem
        todo={{ ...baseTodo, completed: true }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /^delete:/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('calls onDelete(id) when the delete button is clicked, without firing onToggle', async () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={onToggle} onDelete={onDelete} />,
    );
    await user.click(screen.getByRole('button', { name: /^delete:/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(baseTodo.id);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('calls onDelete when Enter is pressed with the delete button focused (native button contract)', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={vi.fn()} onDelete={onDelete} />,
    );
    const button = screen.getByRole('button', { name: /^delete:/i });
    button.focus();
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(baseTodo.id);
  });

  it('calls onDelete when Space is pressed with the delete button focused (native button contract)', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem todo={baseTodo} onToggle={vi.fn()} onDelete={onDelete} />,
    );
    screen.getByRole('button', { name: /^delete:/i }).focus();
    await user.keyboard(' ');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders the delete button as disabled when todo.pending === true and does NOT call onDelete on click', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <TodoItem
        todo={{ ...baseTodo, pending: true }}
        onToggle={vi.fn()}
        onDelete={onDelete}
      />,
    );
    const button = screen.getByRole('button', { name: /^delete:/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('aria-label preserves todo text verbatim including HTML-looking characters (NFR17 attribute escaping)', () => {
    const xss: TodoEntry = {
      ...baseTodo,
      text: '<script>alert("x")</script>',
    };
    render(<TodoItem todo={xss} onToggle={vi.fn()} onDelete={vi.fn()} />);
    const button = screen.getByLabelText(
      'Delete: <script>alert("x")</script>',
    );
    expect(button).toBeInTheDocument();
    expect(button.querySelector('script')).toBeNull();
  });
});
