import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// API and web origins differ (Playwright `baseURL` is the WEB origin used by
// `page.goto`); route mocks need an absolute URL. Mirrors xss-payload.spec.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const FAILING_IMPACTS = new Set(['critical', 'serious']);

async function assertNoSeriousA11yViolations(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  for (const violation of results.violations) {
    if (!FAILING_IMPACTS.has(violation.impact ?? '')) {
      await testInfo.attach(`a11y-${violation.id}`, {
        body: `[${violation.impact}] ${violation.id}: ${violation.help} — ${violation.nodes.length} node(s) — ${violation.helpUrl}`,
        contentType: 'text/plain',
      });
    }
  }

  const failing = results.violations.filter((v) =>
    FAILING_IMPACTS.has(v.impact ?? ''),
  );
  expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
}

test.describe('P1-013 accessibility — axe-core WCAG AA scans across app states', () => {
  test('@P1 @A11y empty-list state has zero critical/serious violations', async ({
    page,
  }, testInfo) => {
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { todos: [] } });
    });

    await page.goto('/');
    await expect(page.getByTestId('todo-list-empty')).toBeVisible();

    await assertNoSeriousA11yViolations(page, testInfo);
  });

  test('@P1 @A11y populated state (mixed active/completed) has zero critical/serious violations', async ({
    page,
  }, testInfo) => {
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
    await expect(page.getByTestId('todo-list')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(2);

    await assertNoSeriousA11yViolations(page, testInfo);
  });

  test('@P1 @A11y initial-load error state (retry UI) has zero critical/serious violations', async ({
    page,
  }, testInfo) => {
    await page.route(`${API_URL}/todos`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
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
    await expect(page.getByTestId('todo-list-error')).toBeVisible();

    await assertNoSeriousA11yViolations(page, testInfo);
  });

  test('@P1 @A11y toast-visible state (mutation failure) has zero critical/serious violations', async ({
    page,
  }, testInfo) => {
    const seed = {
      id: '33333333-3333-4333-8333-333333333333',
      text: 'a11y-scan-seed',
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
    const row = page.getByTestId('todo-item').filter({ hasText: seed.text });
    await row.getByTestId('todo-item-delete').click();
    await expect(page.getByTestId('toast-root')).toBeVisible();

    await assertNoSeriousA11yViolations(page, testInfo);
  });
});
