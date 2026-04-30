import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodoInput from './TodoInput';

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

describe('<TodoInput />', () => {
  it('renders an empty controlled input with a disabled submit button', () => {
    render(<TodoInput onAdd={vi.fn()} />);
    const input = screen.getByLabelText(/add a todo/i) as HTMLInputElement;
    const submit = screen.getByRole('button', {
      name: /add/i,
    }) as HTMLButtonElement;
    expect(input.value).toBe('');
    expect(submit).toBeDisabled();
  });

  it('enables submit when a non-whitespace character is typed', async () => {
    const user = userEvent.setup();
    render(<TodoInput onAdd={vi.fn()} />);
    await user.type(screen.getByLabelText(/add a todo/i), 'a');
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled();
  });

  it('keeps submit disabled for whitespace-only input', async () => {
    const user = userEvent.setup();
    render(<TodoInput onAdd={vi.fn()} />);
    await user.type(screen.getByLabelText(/add a todo/i), '   ');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('calls onAdd with the typed text verbatim when Enter is pressed inside the input', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    const input = screen.getByLabelText(/add a todo/i);
    await user.type(input, 'buy milk{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('buy milk');
  });

  it('calls onAdd with the typed text verbatim when the submit button is clicked', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    await user.type(screen.getByLabelText(/add a todo/i), 'walk dog');
    await user.click(screen.getByRole('button', { name: /add/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('walk dog');
  });

  it('passes whitespace verbatim (server trims; client does NOT)', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    await user.type(
      screen.getByLabelText(/add a todo/i),
      '  buy milk  {Enter}',
    );
    expect(onAdd).toHaveBeenCalledWith('  buy milk  ');
  });

  it('resets the input value to empty after a successful submit', async () => {
    const user = userEvent.setup();
    render(<TodoInput onAdd={vi.fn()} />);
    const input = screen.getByLabelText(/add a todo/i) as HTMLInputElement;
    await user.type(input, 'buy milk{Enter}');
    expect(input.value).toBe('');
  });

  it('disables the submit button again after a successful submit clears the input', async () => {
    const user = userEvent.setup();
    render(<TodoInput onAdd={vi.fn()} />);
    await user.type(screen.getByLabelText(/add a todo/i), 'buy milk{Enter}');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('retains focus on the input after submit', async () => {
    const user = userEvent.setup();
    render(<TodoInput onAdd={vi.fn()} />);
    const input = screen.getByLabelText(/add a todo/i);
    await user.type(input, 'buy milk{Enter}');
    expect(input).toHaveFocus();
  });

  it('does NOT call onAdd when value is empty', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    const input = screen.getByLabelText(/add a todo/i);
    await user.type(input, '{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does NOT call onAdd when value is whitespace-only', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    const input = screen.getByLabelText(/add a todo/i);
    await user.type(input, '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('passes literal HTML/script text to onAdd without parsing or escaping (escaping is the renderer\'s job)', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TodoInput onAdd={onAdd} />);
    await user.type(
      screen.getByLabelText(/add a todo/i),
      '<script>alert(1)</script>{Enter}',
    );
    expect(onAdd).toHaveBeenCalledWith('<script>alert(1)</script>');
  });

  it('does NOT set a maxLength attribute (server is the length authority)', () => {
    render(<TodoInput onAdd={vi.fn()} />);
    const input = screen.getByLabelText(/add a todo/i);
    expect(input).not.toHaveAttribute('maxlength');
  });

  it('renders exactly one form, one input, and one submit button', () => {
    render(<TodoInput onAdd={vi.fn()} />);
    const form = screen.getByTestId('todo-input');
    expect(form.tagName).toBe('FORM');
    expect(form.querySelectorAll('input')).toHaveLength(1);
    expect(form.querySelectorAll('button')).toHaveLength(1);
  });
});
