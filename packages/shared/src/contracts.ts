import { z } from 'zod';

const todoText = z.string().trim().min(1).max(500);

export const TodoSchema = z
  .object({
    id: z.string().uuid(),
    text: todoText,
    completed: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const CreateTodoRequestSchema = z
  .object({
    text: todoText,
  })
  .strict();

export const UpdateTodoRequestSchema = z
  .object({
    completed: z.boolean(),
  })
  .strict();

export const TodoListResponseSchema = z
  .object({
    todos: z.array(TodoSchema),
  })
  .strict();

export const ErrorResponseSchema = z
  .object({
    statusCode: z.number().int().positive(),
    error: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })
  .strict();

export type Todo = z.infer<typeof TodoSchema>;
export type CreateTodoRequest = z.infer<typeof CreateTodoRequestSchema>;
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>;
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
