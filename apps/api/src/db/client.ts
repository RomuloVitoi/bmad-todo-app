import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { asc } from 'drizzle-orm';
import { todos } from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (apps/api/src/db/client.ts)');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema: { todos } });

// Typed query helpers — handlers import these, not the raw `todos` table.
export const listTodos = () =>
  db.select().from(todos).orderBy(asc(todos.createdAt));
