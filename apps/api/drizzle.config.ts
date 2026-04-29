import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env from repo root so `drizzle-kit` (invoked standalone via `db:migrate`)
// has DATABASE_URL without depending on Node's `--env-file` flag.
config({ path: new URL('../../.env', import.meta.url) });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
