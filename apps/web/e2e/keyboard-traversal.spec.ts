import { test, expect, type Locator } from '@playwright/test';

// API and web origins differ (Playwright `baseURL` is the WEB origin used by
// `page.goto`); route mocks need an absolute URL. Mirrors accessibility.spec.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function hasVisibleFocusIndicator(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const hasOutline =
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const hasBoxShadow = style.boxShadow !== 'none';
    return hasOutline || hasBoxShadow;
  });
}

test.describe('P1-014 keyboard traversal — focus order and keyboard operability', () => {
  test('@P1 @A11y @Keyboard full Tab order across a populated list matches DOM order', async ({
    page,
    browserName,
  }) => {
    const now = '2026-07-05T00:00:00.000Z';
    const todos = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        text: 'active todo',
        completed: false,
        createdAt: now,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        text: 'completed todo',
        completed: true,
        createdAt: now,
      },
    ];
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { todos } });
    });

    await page.goto('/');
    await expect(page.getByTestId('todo-item')).toHaveCount(2);

    const row1 = page.getByTestId('todo-item').nth(0);
    const row2 = page.getByTestId('todo-item').nth(1);
    const inputField = page.getByTestId('todo-input-field');

    // The submit button is `disabled` while the input is empty (TodoInput.tsx
    // `disabled={isEmpty}`), and disabled buttons are removed from the native
    // Tab order in every engine — that's correct product behavior (nothing to
    // submit), not a focus-order defect. Typing via the keyboard (not a
    // pointer event) is the realistic precondition for the submit button to
    // ever appear in a Tab sequence at all.
    await page.keyboard.press('Tab');
    await expect(inputField).toBeFocused();
    expect(await hasVisibleFocusIndicator(inputField)).toBe(true);
    await page.keyboard.type('x');
    // Wait for React to commit the `disabled=false` re-render before tabbing —
    // otherwise the first `Tab` below can fire while the submit button is still
    // disabled (thus skipped from the Tab order), and the one-shot key press
    // cannot recover. Retrying assertion, so it costs nothing when already enabled.
    await expect(page.getByTestId('todo-input-submit')).toBeEnabled();

    const remainingStops = [
      page.getByTestId('todo-input-submit'),
      row1.getByTestId('todo-item-checkbox'),
      row1.getByTestId('todo-item-delete'),
      row2.getByTestId('todo-item-checkbox'),
      row2.getByTestId('todo-item-delete'),
    ];

    // WebKit's default keyboard-navigation mode (matching real Safari without
    // "Full Keyboard Access" enabled) only cycles plain `Tab` through text
    // fields and links — buttons and Radix's button-rendered checkbox need
    // `Alt+Tab` to receive focus. This is a genuine, unavoidable engine
    // difference (verified empirically: plain `Tab` from a focused button
    // loses focus entirely in WebKit, while `Alt+Tab` correctly advances
    // through submit → checkbox → delete → checkbox → delete). Chromium and
    // Firefox include all of these in the plain `Tab` order. Both are
    // keyboard-only key presses — neither relies on mouse/pointer input.
    const nextControlKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    for (const stop of remainingStops) {
      await page.keyboard.press(nextControlKey);
      await expect(stop).toBeFocused();
      expect(await hasVisibleFocusIndicator(stop)).toBe(true);
    }
  });

  test('@P1 @A11y @Keyboard Space toggles a focused checkbox', async ({
    page,
  }) => {
    const seed = {
      id: '33333333-3333-4333-8333-333333333333',
      text: 'space-toggle-seed',
      completed: false,
      createdAt: '2026-07-05T00:00:00.000Z',
    };
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { todos: [seed] } });
    });
    await page.route(`${API_URL}/todos/${seed.id}`, async (route) => {
      await route.fulfill({ json: { ...seed, completed: true } });
    });

    await page.goto('/');
    const row = page.getByTestId('todo-item');
    const checkbox = row.getByTestId('todo-item-checkbox');

    await checkbox.focus();
    expect(await hasVisibleFocusIndicator(checkbox)).toBe(true);
    await page.keyboard.press('Space');

    await expect(row).toHaveAttribute('data-completed', 'true');
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  test('@P1 @A11y @Keyboard Enter removes a focused delete button item', async ({
    page,
  }) => {
    const seed = {
      id: '44444444-4444-4444-8444-444444444444',
      text: 'enter-delete-seed',
      completed: false,
      createdAt: '2026-07-05T00:00:00.000Z',
    };
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { todos: [seed] } });
    });
    await page.route(`${API_URL}/todos/${seed.id}`, async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/');
    const deleteButton = page.getByTestId('todo-item-delete');

    await deleteButton.focus();
    expect(await hasVisibleFocusIndicator(deleteButton)).toBe(true);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });

  test('@P1 @A11y @Keyboard Enter on a focused Retry button re-fetches and clears the error state', async ({
    page,
  }) => {
    let callCount = 0;
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          json: {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'boom',
          },
        });
        return;
      }
      await route.fulfill({ json: { todos: [] } });
    });

    await page.goto('/');
    await expect(page.getByTestId('todo-list-error')).toBeVisible();

    const retryButton = page
      .getByTestId('todo-list-error')
      .getByRole('button', { name: 'Retry' });
    await retryButton.focus();
    expect(await hasVisibleFocusIndicator(retryButton)).toBe(true);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('todo-list-error')).toBeHidden();
    await expect(page.getByTestId('todo-list-empty')).toBeVisible();
  });

  test('@P1 @A11y @Keyboard Escape dismisses a focused Toast', async ({
    page,
  }) => {
    const seed = {
      id: '55555555-5555-4555-8555-555555555555',
      text: 'escape-dismiss-seed',
      completed: false,
      createdAt: '2026-07-05T00:00:00.000Z',
    };
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { todos: [seed] } });
    });
    await page.route(`${API_URL}/todos/${seed.id}`, async (route) => {
      await route.fulfill({
        status: 500,
        json: {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'boom',
        },
      });
    });

    await page.goto('/');
    await page.getByTestId('todo-item-delete').focus();
    await page.keyboard.press('Enter');

    const toast = page.getByTestId('toast-root');
    await expect(toast).toBeVisible();

    await toast.focus();
    await expect(toast).toHaveJSProperty('tabIndex', 0);
    await page.keyboard.press('Escape');
    await expect(toast).toBeHidden();
  });
});
