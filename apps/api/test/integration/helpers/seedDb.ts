import { db } from '../../../src/db/client.js';
import { todos } from '../../../src/db/schema.js';

// Defense against pointing test runs at a non-test database. Refuses
// to mutate if NODE_ENV is production OR if the configured URL doesn't
// look like a local/test target. A misconfigured `.env` plus
// `npm run test:integration` would otherwise silently truncate prod data.
function assertSafeTestDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seedDb: refusing to run in NODE_ENV=production');
  }
  const url = process.env.DATABASE_URL ?? '';
  const looksLocal = /\b(localhost|127\.0\.0\.1|::1|host\.docker\.internal)\b/.test(url);
  const looksTest = /\b(test|todoapp_test|todoapp)\b/i.test(url);
  if (!looksLocal && !looksTest) {
    throw new Error(
      `seedDb: DATABASE_URL does not look like a local/test database (got: ${url.replace(/:[^:@]+@/, ':***@')}). ` +
        'Refusing to mutate. Set NODE_ENV=test and point DATABASE_URL at a local Postgres to override.',
    );
  }
}

export async function resetTodos(): Promise<void> {
  assertSafeTestDatabase();
  await db.delete(todos);
}

export interface SeedTodo {
  text: string;
  completed?: boolean;
  createdAt?: Date;
}

export async function seedTodos(rows: SeedTodo[]): Promise<void> {
  assertSafeTestDatabase();
  // Default each row to a distinct timestamp so query order is deterministic
  // when callers don't pin createdAt explicitly. Spreads rows 1ms apart from
  // a single base time captured at call entry.
  const base = Date.now();
  await db.insert(todos).values(
    rows.map((r, i) => ({
      text: r.text,
      completed: r.completed ?? false,
      createdAt: r.createdAt ?? new Date(base + i),
    })),
  );
}
