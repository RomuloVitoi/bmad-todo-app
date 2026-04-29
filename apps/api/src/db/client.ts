import type { CreateTodoRequest, Todo } from '@todo-app/shared';
import { asc, eq } from 'drizzle-orm';
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

export const createTodo = async (input: CreateTodoRequest): Promise<Todo> => {
  const [row] = await db.insert(todos).values({ text: input.text }).returning();
  if (!row) {
    // `.returning()` always emits the inserted row(s) on Postgres; this is a
    // type-narrowing guard for TS, not a runtime expectation.
    throw new Error('createTodo: insert returned no rows');
  }
  return toWire(row);
};

export const updateTodoCompleted = async (
  id: string,
  completed: boolean,
): Promise<Todo | null> => {
  const [row] = await db
    .update(todos)
    .set({ completed })
    .where(eq(todos.id, id))
    .returning();
  return row ? toWire(row) : null;
};

export const deleteTodoById = async (id: string): Promise<boolean> => {
  const rows = await db
    .delete(todos)
    .where(eq(todos.id, id))
    .returning({ id: todos.id });
  return rows.length === 1;
};
