import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// API and web origins differ (Playwright `baseURL` is the WEB origin used by
// `page.goto`); API calls via `request.*` need an absolute URL. Mirrors
// xss-payload.spec.ts:1-9.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('P0-022 Journey 1 — happy path', () => {
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    // Tolerate 404 — test may have failed before the row was created.
    if (createdId !== null) {
      const res = await request.delete(`${API_URL}/todos/${createdId}`, {
        headers: { 'x-request-id': randomUUID() },
      });
      expect([204, 404]).toContain(res.status());
      createdId = null;
    }
  });

  test('@P0 @Journey1 add via input then toggle reflects completed state', async ({
    page,
    request,
  }) => {
    // Per-test unique text scopes every locator so the 3 parallel browser
    // projects do not collide on shared rows in the dev DB.
    const text = `j1-${randomUUID()}`;

    await page.goto('/');
    // Tolerate either populated list or empty state — the shared dev DB may
    // already contain rows from prior runs / parallel siblings.
    await expect(
      page.getByTestId('todo-list').or(page.getByTestId('todo-list-empty')),
    ).toBeVisible();

    // Add via UI input — Enter triggers <form onSubmit> in TodoInput.
    await page.getByTestId('todo-input-field').fill(text);
    await page.getByTestId('todo-input-field').press('Enter');

    // Locate the new row by its unique text. Playwright auto-retries until
    // the optimistic add reconciles (handleToggle bails when pending=true,
    // so the next assertion implicitly waits for reconcile too).
    const row = page.getByTestId('todo-item').filter({ hasText: text });
    await expect(row).toHaveAttribute('data-completed', 'false');

    // Toggle complete via the row's Radix checkbox.
    await row.getByTestId('todo-item-checkbox').click();
    await expect(row).toHaveAttribute('data-completed', 'true');

    // Completed rows render with line-through (see TodoItem.tsx:57-61). Class
    // assertion is more browser-stable than toHaveCSS('text-decoration-line'),
    // which differs across engines (longhand vs shorthand).
    await expect(row.getByTestId('todo-item-text')).toHaveClass(/line-through/);

    // Capture server id for cleanup. The DOM does not expose it (no data-id
    // on todo-item, by design); query the API and filter by our unique text.
    const listRes = await request.get(`${API_URL}/todos`, {
      headers: { 'x-request-id': randomUUID() },
    });
    expect(listRes.status()).toBe(200);
    const { todos } = (await listRes.json()) as {
      todos: Array<{ id: string; text: string }>;
    };
    const found = todos.find((t) => t.text === text);
    if (found) createdId = found.id;
  });
});
