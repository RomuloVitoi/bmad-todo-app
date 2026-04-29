import type { Todo } from '@todo-app/shared';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { todos } from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (apps/api/src/db/client.ts)');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema: { todos } });

const toWire = (row: typeof todos.$inferSelect): Todo => ({
  id: row.id,
  text: row.text,
  completed: row.completed,
  createdAt: row.createdAt.toISOString(),
});

// `id` tiebreaker keeps order deterministic when two rows share `created_at`
// (FR10: "consistent, predictable order across page loads").
export const listTodos = async (): Promise<Todo[]> => {
  const rows = await db
    .select()
    .from(todos)
    .orderBy(asc(todos.createdAt), asc(todos.id));
  return rows.map(toWire);
};
