import { db } from '../../../src/db/client.js';
import { todos } from '../../../src/db/schema.js';

export async function resetTodos(): Promise<void> {
  await db.delete(todos);
}

export interface SeedTodo {
  text: string;
  completed?: boolean;
  createdAt?: Date;
}

export async function seedTodos(rows: SeedTodo[]): Promise<void> {
  await db.insert(todos).values(
    rows.map((r) => ({
      text: r.text,
      completed: r.completed ?? false,
      createdAt: r.createdAt ?? new Date(),
    })),
  );
}
