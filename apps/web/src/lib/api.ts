import { TodoListResponseSchema, type Todo } from '@todo-app/shared';
import { ApiError } from './errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required (apps/web/src/lib/api.ts)');
}

function newRequestId(): string {
  return crypto.randomUUID();
}

export async function getTodos(signal?: AbortSignal): Promise<Todo[]> {
  const requestId = newRequestId();
  const response = await fetch(`${API_URL}/todos`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-request-id': requestId,
    },
    signal,
  });

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  const body = await response.json();
  const parsed = TodoListResponseSchema.parse(body);
  return parsed.todos;
}
