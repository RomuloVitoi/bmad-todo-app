import { StrictMode } from 'react';
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

    // FR19: the typed text re-appears in the input after the rollback.
    expect((input as HTMLInputElement).value).toBe('fail me');
  });

  it('preserves in-flight input when an earlier submission fails after a later one succeeds', async () => {
    let resolveA!: (response: Response) => void;
    let resolveB!: (response: Response) => void;
    const postA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    const postB = new Promise<Response>((resolve) => {
      resolveB = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockReturnValueOnce(postA)
      .mockReturnValueOnce(postB);
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const input = (await screen.findByLabelText(
      /add a todo/i,
    )) as HTMLInputElement;

    const user = userEvent.setup();
    await user.type(input, 'A{Enter}');
    await user.type(input, 'B{Enter}');

    const list = await screen.findByTestId('todo-list');
    expect(within(list).getByText('A')).toBeInTheDocument();
    expect(within(list).getByText('B')).toBeInTheDocument();

    // B (the later submission) succeeds first.
    resolveB(
      jsonResponse(
        {
          id: '22222222-2222-4222-8222-222222222222',
          text: 'B',
          completed: false,
          createdAt: '2026-04-29T00:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    await within(list).findByText('B');

    // A (the earlier submission) fails afterward — its restoration must
    // NOT overwrite the input, which currently reflects B's outcome (empty).
    resolveA(
      jsonResponse(
        { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
        { status: 500 },
      ),
    );
    await waitFor(() => {
      expect(screen.queryByText('A')).not.toBeInTheDocument();
    });

    expect(input.value).toBe('');
    expect(within(list).getByText('B')).toBeInTheDocument();
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

describe('<TodoApp /> mutation-failure toasts', () => {
  const seed = {
    id: '11111111-1111-4111-8111-111111111111',
    text: 'pick up milk',
    completed: false,
    createdAt: '2026-04-29T00:00:00.000Z',
  };

  it('add-failure shows the mapped (not raw) message in the Toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          { status: 500 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add a todo/i), 'fail me{Enter}');

    expect(await screen.findByTestId('toast-description')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('toggle-failure shows the mapped (not raw) message in the Toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          { status: 500 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const checkbox = await screen.findByRole('checkbox', { name: seed.text });
    const user = userEvent.setup();
    await user.click(checkbox);

    expect(await screen.findByTestId('toast-description')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('delete-failure shows the mapped (not raw) message in the Toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [seed] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          { status: 500 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    const deleteBtn = await screen.findByRole('button', {
      name: /^delete: pick up milk$/i,
    });
    const user = userEvent.setup();
    await user.click(deleteBtn);

    expect(await screen.findByTestId('toast-description')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('single-toast model: a second failure with a different status replaces the first message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 400, error: 'Bad Request', message: 'bad' },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 404, error: 'Not Found', message: 'gone' },
          { status: 404 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const user = userEvent.setup();
    const input = screen.getByLabelText(/add a todo/i);

    await user.type(input, 'first{Enter}');
    expect(await screen.findByTestId('toast-description')).toHaveTextContent(
      "That change couldn't be saved.",
    );

    await user.type(input, 'second{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('toast-description')).toHaveTextContent(
        'This todo no longer exists.',
      ),
    );
  });

  it('a successful mutation does not dismiss an already-displayed failure Toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          { status: 500 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: '22222222-2222-4222-8222-222222222222',
            text: 'succeed',
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
    const input = screen.getByLabelText(/add a todo/i);

    await user.type(input, 'fail me{Enter}');
    expect(await screen.findByTestId('toast-description')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );

    await user.type(input, 'succeed{Enter}');
    await screen.findByText('succeed');
    expect(screen.getByTestId('toast-description')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('Toast text contains no raw server envelope (no status digits, no raw server message)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 503, error: 'Service Unavailable', message: 'oops' },
          { status: 503 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add a todo/i), 'fail me{Enter}');

    const toast = await screen.findByTestId('toast-description');
    expect(toast.textContent).not.toMatch(/\d{3}/);
    expect(toast.textContent).not.toMatch(/oops/i);
    expect(toast.textContent).not.toMatch(/https?:\/\//i);
  });

  it('logs requestId/statusCode at console.debug level only; never renders requestId in the Toast', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          {
            status: 500,
            headers: { 'x-request-id': 'srv-debug-correlation-id' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-empty');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add a todo/i), 'fail me{Enter}');

    const toast = await screen.findByTestId('toast-description');
    await waitFor(() =>
      expect(debugSpy).toHaveBeenCalledWith(
        'mutation failed',
        expect.objectContaining({ requestId: 'srv-debug-correlation-id' }),
      ),
    );
    expect(toast.textContent).not.toMatch(/srv-debug-correlation-id/);
  });
});

describe('<TodoApp /> initial-load retry journey', () => {
  it('retry after initial-load failure: click Retry → loading → success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
          { status: 500 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ todos: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-error');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await screen.findByTestId('todo-list-empty');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retry after initial-load failure: click Retry → fails again → error UI reappears, no Toast', async () => {
    const errorResponse = () =>
      jsonResponse(
        { statusCode: 500, error: 'Internal Server Error', message: 'oops' },
        { status: 500 },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(errorResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);

    await screen.findByTestId('todo-list-error');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await screen.findByTestId('todo-list-error');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('toast-root')).not.toBeInTheDocument();
  });
});

describe('<TodoApp /> global safety net', () => {
  it('unhandled promise rejection surfaces the generic Toast and logs via console.error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);
    await screen.findByTestId('todo-list-empty');

    const reason = new Error('boom');
    const rejected = Promise.reject(reason);
    rejected.catch(() => {}); // pre-handle so the real Node runtime never sees this as unhandled
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: rejected,
      reason,
    });
    window.dispatchEvent(event);

    const toast = await screen.findByTestId('toast-root');
    expect(toast).toHaveTextContent('Something went wrong. Please try again.');
    expect(errorSpy).toHaveBeenCalledWith('[safety-net] unhandled rejection', reason);
  });

  it('uncaught error event surfaces the same generic Toast', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);
    await screen.findByTestId('todo-list-empty');

    const error = new Error('kaboom');
    const event = new ErrorEvent('error', { error, message: error.message });
    window.dispatchEvent(event);

    const toast = await screen.findByTestId('toast-root');
    expect(toast).toHaveTextContent('Something went wrong. Please try again.');
    expect(errorSpy).toHaveBeenCalledWith('[safety-net] uncaught error', error);
  });

  it('unmount removes both the unhandledrejection and error listeners', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { default: TodoApp } = await import('./TodoApp');
    const { unmount } = render(<TodoApp />);
    await screen.findByTestId('todo-list-empty');

    const rejectionHandler = addSpy.mock.calls.find(([type]) => type === 'unhandledrejection')?.[1];
    const errorHandler = addSpy.mock.calls.find(([type]) => type === 'error')?.[1];
    expect(rejectionHandler).toBeDefined();
    expect(errorHandler).toBeDefined();

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', rejectionHandler);
    expect(removeSpy).toHaveBeenCalledWith('error', errorHandler);
  });

  it('a caught mutation failure does not trigger the safety net', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ todos: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 500, error: 'Internal Server Error', message: 'oops' }, { status: 500 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);
    await screen.findByTestId('todo-list-empty');

    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'buy milk{Enter}');

    const toast = await screen.findByTestId('toast-root');
    expect(toast).toHaveTextContent('Something went wrong. Please try again.');
    expect(errorSpy).not.toHaveBeenCalledWith('[safety-net] unhandled rejection', expect.anything());
    expect(errorSpy).not.toHaveBeenCalledWith('[safety-net] uncaught error', expect.anything());
  });

  it('StrictMode double-mount registers listeners exactly once effectively (no duplicate Toasts)', async () => {
    // StrictMode double-invokes the pre-existing mount-load effect (out of
    // scope for this story), firing a second, superseded `getTodos()` call.
    // A fresh Response per call (rather than `mockResolvedValueOnce`) keeps
    // that extra call from starving on an empty mock queue.
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ todos: [] })));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: TodoApp } = await import('./TodoApp');
    render(
      <StrictMode>
        <TodoApp />
      </StrictMode>,
    );
    await screen.findByTestId('todo-list-empty');

    const reason = new Error('boom');
    const rejected = Promise.reject(reason);
    rejected.catch(() => {});
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: rejected, reason }));

    const toasts = await screen.findAllByTestId('toast-root');
    expect(toasts).toHaveLength(1);
  });

  it('ignores benign browser noise (ResizeObserver loop, opaque cross-origin) but still surfaces genuine errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ todos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { default: TodoApp } = await import('./TodoApp');
    render(<TodoApp />);
    await screen.findByTestId('todo-list-empty');

    // Benign ResizeObserver loop notification (Chrome dispatches this as a window error).
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }),
    );
    // Opaque cross-origin error: no error object, no filename, generic message.
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    // A genuine app error must still get through.
    const error = new Error('real');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message, filename: 'app.js' }));

    const toasts = await screen.findAllByTestId('toast-root');
    expect(toasts).toHaveLength(1);
  });
});
