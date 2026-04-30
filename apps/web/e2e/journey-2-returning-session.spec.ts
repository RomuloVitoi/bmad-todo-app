import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// API and web origins differ (Playwright `baseURL` is the WEB origin used by
// `page.goto`); API calls via `request.*` need an absolute URL. Mirrors
// xss-payload.spec.ts:1-9.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('P0-023 Journey 2 — returning session: reload + delete persists', () => {
  const seededIds: string[] = [];

  test.afterEach(async ({ request }) => {
    // Cleanup all seeded rows. The UI delete in the test removes one of
    // them; the API will 404 on that retry, which is tolerated.
    for (const id of seededIds) {
      const res = await request.delete(`${API_URL}/todos/${id}`, {
        headers: { 'x-request-id': randomUUID() },
      });
      expect([204, 404]).toContain(res.status());
    }
    seededIds.length = 0;
  });

  test('@P0 @Journey2 @P2-011 reload preserves seeded rows; UI-deleted row stays gone after reload', async ({
    page,
    request,
  }) => {
    // Per-test unique uuid scopes every locator so the 3 parallel browser
    // projects do not collide on shared rows in the dev DB.
    const uuid = randomUUID();
    const keepA = `j2-keep-a-${uuid}`;
    const keepB = `j2-keep-b-${uuid}`;
    const deleteText = `j2-delete-${uuid}`;

    // Seed three rows via API — simulates a returning user opening a tab on
    // an already-populated shared list. THREE rows (not two) make the
    // post-delete persistence assertion structurally sound: a list-rewrite
    // bug that drops everything except a survivor by coincidence of count
    // would still fail the two-keep-rows-visible check.
    for (const text of [keepA, keepB, deleteText]) {
      const res = await request.post(`${API_URL}/todos`, {
        data: { text },
        headers: { 'x-request-id': randomUUID() },
      });
      expect(res.status()).toBe(201);
      const created = (await res.json()) as { id: string };
      seededIds.push(created.id);
    }

    // Load the page; assert the populated list contains all three seeds.
    await page.goto('/');
    const list = page.getByTestId('todo-list');
    await expect(list).toBeVisible();
    await expect(list.getByText(keepA)).toBeVisible();
    await expect(list.getByText(keepB)).toBeVisible();
    await expect(list.getByText(deleteText)).toBeVisible();

    // Delete the j2-delete-* row via the UI. Wait for the actual API DELETE
    // to land before reloading — otherwise the optimistic UI removes the row
    // synchronously while the server-side DELETE is still in flight, and the
    // post-reload GET could race the DELETE and re-render the row (flake).
    const deleteRow = page
      .getByTestId('todo-item')
      .filter({ hasText: deleteText });
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === 'DELETE' &&
          res.url().includes('/todos/') &&
          res.status() === 204,
      ),
      deleteRow.getByTestId('todo-item-delete').click(),
    ]);
    await expect(page.getByText(deleteText)).toHaveCount(0);

    // Reload — both keep-rows must persist (P0-023 returning session); the
    // deleted row must remain absent (P2-011 DELETE round-trip).
    await page.reload();
    await expect(page.getByTestId('todo-list')).toBeVisible();
    await expect(page.getByText(keepA)).toBeVisible();
    await expect(page.getByText(keepB)).toBeVisible();
    await expect(page.getByText(deleteText)).toHaveCount(0);
  });
});
