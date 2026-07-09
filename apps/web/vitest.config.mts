import tsconfigPaths from 'vite-tsconfig-paths';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Build/tool config — not application logic. Vitest's default
        // exclude list only recognizes a fixed set of tool names (karma,
        // webpack, eslint, etc.) that doesn't include next/playwright/postcss.
        '*.config.{ts,mts,mjs}',
        // Trivial Next.js App Router boilerplate (font/metadata setup,
        // a one-line render of <TodoApp/>) — exercised by the Playwright
        // e2e suite (journey specs, accessibility.spec.ts), not vitest.
        'src/app/layout.tsx',
        'src/app/page.tsx',
      ],
    },
  },
});
