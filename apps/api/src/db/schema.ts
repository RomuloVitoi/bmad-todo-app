import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  text: text('text').notNull(),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
