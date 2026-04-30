import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// The API and web origins are different (Playwright `baseURL` is the WEB
// origin used by `page.goto`). For API calls via `request.*`, use an
// absolute URL — fall back to localhost:4000, the dev port from
// `.env.example` NEXT_PUBLIC_API_URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.describe('P0-013 stored-XSS payload renders as text, not as DOM', () => {
  const payload = '<script>window.__xss__ = true</script>';
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    // Tolerate 404 — test may have failed before insert.
    if (createdId !== null) {
      const res = await request.delete(`${API_URL}/todos/${createdId}`, {
        headers: { 'x-request-id': randomUUID() },
      });
      expect([204, 404]).toContain(res.status());
      createdId = null;
    }
  });

  test('@P0 @Security stored XSS payload rendered as text, not executed', async ({
    page,
    request,
  }) => {
    // Seed via the API — bypasses the UI input path so the payload reaches
    // the DB exactly as a hostile client would send it.
    const createRes = await request.post(`${API_URL}/todos`, {
      data: { text: payload },
      headers: { 'x-request-id': randomUUID() },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string };
    createdId = created.id;

    // Navigate to the home page; wait for the populated list to render.
    await page.goto('/');
    await expect(page.getByTestId('todo-list')).toBeVisible();

    // The payload must be visible AS LITERAL TEXT in the DOM — proving
    // React's JSX text-escaping passed the angle-brackets through as text.
    await expect(page.getByText(payload)).toBeVisible();

    // The payload must NOT have executed — `window.__xss__` is undefined.
    const xssExecuted = await page.evaluate(
      () => (window as unknown as { __xss__?: boolean }).__xss__,
    );
    expect(xssExecuted).toBeUndefined();

    // Defense-in-depth: no <script> element in the DOM matches the payload's body.
    // If JSX escaping had failed, browsers would have parsed the injected
    // <script> and one of these would resolve.
    const scriptCount = await page
      .locator('script:has-text("__xss__ = true")')
      .count();
    expect(scriptCount).toBe(0);
  });
});
