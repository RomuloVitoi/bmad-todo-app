import {
  TodoListResponseSchema,
  TodoSchema,
  type Todo,
} from '@todo-app/shared';
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

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError({
      statusCode: response.status,
      message: 'Malformed JSON in successful response',
      requestId: responseRequestId,
    });
  }

  const parsed = TodoListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      statusCode: response.status,
      message: 'Response did not match the expected todos schema',
      requestId: responseRequestId,
    });
  }
  return parsed.data.todos;
}

export async function createTodo(
  text: string,
  signal?: AbortSignal,
): Promise<Todo> {
  const requestId = newRequestId();
  const response = await fetch(`${API_URL}/todos`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError({
      statusCode: response.status,
      message: 'Malformed JSON in successful response',
      requestId: responseRequestId,
    });
  }

  const parsed = TodoSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      statusCode: response.status,
      message: 'Response did not match the expected todo schema',
      requestId: responseRequestId,
    });
  }
  return parsed.data;
}

export async function updateTodo(
  id: string,
  completed: boolean,
  signal?: AbortSignal,
): Promise<Todo> {
  const requestId = newRequestId();
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ completed }),
    signal,
  });

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError({
      statusCode: response.status,
      message: 'Malformed JSON in successful response',
      requestId: responseRequestId,
    });
  }

  const parsed = TodoSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      statusCode: response.status,
      message: 'Response did not match the expected todo schema',
      requestId: responseRequestId,
    });
  }
  return parsed.data;
}

export async function deleteTodo(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const requestId = newRequestId();
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      'x-request-id': requestId,
    },
    signal,
  });

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }
  // 204 No Content: no body to parse, no schema to validate.
}
