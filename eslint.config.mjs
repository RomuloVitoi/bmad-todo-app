import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

const repoRoot = new URL('.', import.meta.url).pathname;

const crossAppBan = (selfApp, forbiddenApp) => ({
  plugins: { import: importPlugin },
  settings: {
    'import/resolver': {
      typescript: { project: ['apps/web/tsconfig.json', 'apps/api/tsconfig.json', 'packages/shared/tsconfig.json'] },
      node: true,
    },
  },
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            target: `./apps/${selfApp}`,
            from: `./apps/${forbiddenApp}`,
            message: `Cross-app import blocked: apps/${selfApp} must not import from apps/${forbiddenApp}. Use @todo-app/shared + HTTP.`,
          },
        ],
      },
    ],
  },
});

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    'apps/api/drizzle/**',
    'apps/web/next-env.d.ts',
    '_bmad/**',
    '_bmad-output/**',
    'docs/**',
  ]),

  // Next.js rules apply to the web app only.
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    extends: [...nextVitals, ...nextTs],
    rules: {
      // App Router only — Pages Router rule is not applicable.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // TypeScript recommended rules for the API app and shared package.
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['apps/api/**/*.{ts,tsx}', 'packages/shared/**/*.ts'],
  })),

  // Fastify-cli scaffold patterns: handler signatures ignore some args,
  // plugin typing uses empty interfaces, test helpers use require().
  // Tightened by stricter overrides as real code lands in later stories.
  {
    files: ['apps/api/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_|^(opts|request|reply|t)$', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Cross-app import bans (path-resolving, robust against relative paths).
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ...crossAppBan('web', 'api'),
  },
  {
    files: ['apps/api/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ...crossAppBan('api', 'web'),
  },
]);
