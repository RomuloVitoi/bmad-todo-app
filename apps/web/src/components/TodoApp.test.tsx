import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('<TodoApp /> create journey', () => {
  it('happy path: GET → empty → type → optimistic → POST resolves → reconciled (no duplicate)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: '11111111-1111-4111-8111-111111111111',
            text: 'buy milk',
            completed: false,
            createdAt: '2026-04-29T00:00:00.000Z',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const input = await screen.findByLabelText(/add a todo/i);

    const user = userEvent.setup();
    await user.type(input, 'buy milk{Enter}');

    const list = await screen.findByTestId('todo-list');
    expect(within(list).getByText('buy milk')).toBeInTheDocument();

    const itemsAfter = await within(list).findAllByTestId('todo-item');
    expect(itemsAfter).toHaveLength(1);
    expect(itemsAfter[0]).toHaveTextContent('buy milk');

    const postCall = fetchMock.mock.calls[1]!;
    expect(postCall[0]).toBe('http://localhost:4000/todos');
    expect(postCall[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ text: 'buy milk' }),
    });

    expect((input as HTMLInputElement).value).toBe('');
  });

  it('rollback: optimistic entry appears then disappears when POST rejects', async () => {
    let resolvePost!: (response: Response) => void;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockReturnValueOnce(postPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const input = await screen.findByLabelText(/add a todo/i);

    const user = userEvent.setup();
    await user.type(input, 'fail me{Enter}');

    // Optimistic entry visible while POST is still pending.
    const list = await screen.findByTestId('todo-list');
    expect(within(list).queryByText('fail me')).toBeInTheDocument();

    // Now resolve the POST with a 500 → addFailed dispatch → rollback.
    resolvePost(
      jsonResponse(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'oops',
        },
        { status: 500 },
      ),
    );

    await screen.findByTestId('todo-list-empty');
    expect(screen.queryByText('fail me')).not.toBeInTheDocument();
  });

  it('XSS-as-text: literal HTML in todo text renders as text, never as DOM', async () => {
    const xss = '<script>alert(1)</script>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: '11111111-1111-4111-8111-111111111111',
            text: xss,
            completed: false,
            createdAt: '2026-04-29T00:00:00.000Z',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add a todo/i), `${xss}{Enter}`);

    const list = await screen.findByTestId('todo-list');
    expect(within(list).getByText(xss)).toBeInTheDocument();
    expect(list.querySelector('script')).toBeNull();
  });

  it('hides <TodoInput> until the initial load resolves to success', async () => {
    const neverResolves = new Promise<Response>(() => {});
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(neverResolves));

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-loading');
    expect(screen.queryByLabelText(/add a todo/i)).toBeNull();
  });
});

describe('<TodoApp /> toggle journey', () => {
  const seed = {
    id: '11111111-1111-4111-8111-111111111111',
    text: 'pick up milk',
    completed: false,
    createdAt: '2026-04-29T00:00:00.000Z',
  };

  it('happy path: GET → click → optimistic checked → PATCH resolves → reconciled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockResolvedValueOnce(
        jsonResponse({ ...seed, completed: true }, { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const checkbox = await screen.findByRole('checkbox', { name: seed.text });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    const user = userEvent.setup();
    await user.click(checkbox);

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: seed.text }),
      ).toHaveAttribute('aria-checked', 'true'),
    );

    const patchCall = fetchMock.mock.calls[1]!;
    expect(patchCall[0]).toBe(`http://localhost:4000/todos/${seed.id}`);
    expect(patchCall[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ completed: true }),
    });

    const items = await screen.findAllByTestId('todo-item');
    expect(items).toHaveLength(1);
  });

  it('rollback: optimistic flip reverts when PATCH rejects with 500', async () => {
    let resolvePatch!: (response: Response) => void;
    const patchPromise = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockReturnValueOnce(patchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const checkbox = await screen.findByRole('checkbox', { name: seed.text });
    const user = userEvent.setup();
    await user.click(checkbox);

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: seed.text }),
      ).toHaveAttribute('aria-checked', 'true'),
    );

    resolvePatch(
      jsonResponse(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'oops',
        },
        { status: 500 },
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: seed.text }),
      ).toHaveAttribute('aria-checked', 'false'),
    );
  });
});

describe('<TodoApp /> delete journey', () => {
  const seed = {
    id: '11111111-1111-4111-8111-111111111111',
    text: 'pick up milk',
    completed: false,
    createdAt: '2026-04-29T00:00:00.000Z',
  };

  it('happy path: GET → click delete → optimistic removal → DELETE 204 → row stays gone', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const deleteBtn = await screen.findByRole('button', {
      name: /^delete: pick up milk$/i,
    });
    const user = userEvent.setup();
    await user.click(deleteBtn);

    // Optimistic: the row disappears immediately. The list transitions
    // from populated → empty.
    await screen.findByTestId('todo-list-empty');
    expect(
      screen.queryByRole('button', { name: /^delete:/i }),
    ).toBeNull();

    // DELETE was issued with the right URL, method, and no body.
    const deleteCall = fetchMock.mock.calls[1]!;
    expect(deleteCall[0]).toBe(`http://localhost:4000/todos/${seed.id}`);
    expect(deleteCall[1]).toMatchObject({ method: 'DELETE' });
    expect(deleteCall[1]?.body).toBeUndefined();
  });

  it('rollback: optimistic removal reverts when DELETE rejects with 500 (re-insert at original index)', async () => {
    let resolveDelete!: (response: Response) => void;
    const deletePromise = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockReturnValueOnce(deletePromise);
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const deleteBtn = await screen.findByRole('button', {
      name: /^delete: pick up milk$/i,
    });
    const user = userEvent.setup();
    await user.click(deleteBtn);

    // Optimistic state: row is gone while DELETE is pending.
    await screen.findByTestId('todo-list-empty');

    // Now resolve DELETE with 500 → deleteFailed → re-insert.
    resolveDelete(
      jsonResponse(
        { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
        { status: 500 },
      ),
    );

    // The row reappears at its original position.
    const items = await screen.findAllByTestId('todo-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute('data-completed', 'false');
    expect(items[0]).toHaveTextContent('pick up milk');
  });

  it('delete on a completed todo behaves identically (FR4 state independence)', async () => {
    const completedSeed = { ...seed, completed: true };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [completedSeed] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const deleteBtn = await screen.findByRole('button', {
      name: /^delete: pick up milk$/i,
    });
    const user = userEvent.setup();
    await user.click(deleteBtn);

    await screen.findByTestId('todo-list-empty');
  });
});
