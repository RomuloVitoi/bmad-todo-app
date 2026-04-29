import type { Todo } from '@todo-app/shared';

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

// Internal state shape: a server `Todo` optionally enriched with a `pending`
// flag while a create is in flight. The flag is reducer-internal — it never
// crosses the wire (TodoSchema in @todo-app/shared is `.strict()`).
export type TodoEntry = Todo & { pending?: boolean };

export interface TodoState {
  status: LoadStatus;
  todos: TodoEntry[];
  error?: string;
  requestId?: string;
}

export type TodoAction =
  | { type: 'loadStart' }
  | { type: 'loadSuccess'; payload: Todo[] }
  | { type: 'loadError'; payload: { error: string; requestId?: string } }
  | {
      type: 'addOptimistic';
      payload: { tempId: string; text: string; createdAt: string };
    }
  | { type: 'addReconcile'; payload: { tempId: string; todo: Todo } }
  | { type: 'addFailed'; payload: { tempId: string } }
  | { type: 'toggleOptimistic'; payload: { id: string; completed: boolean } }
  | {
      type: 'toggleFailed';
      payload: { id: string; previousCompleted: boolean };
    }
  | { type: 'deleteOptimistic'; payload: { id: string } }
  | { type: 'deleteFailed'; payload: { todo: Todo; index: number } };

export const initialState: TodoState = {
  status: 'idle',
  todos: [],
};

export function reducer(state: TodoState, action: TodoAction): TodoState {
  switch (action.type) {
    case 'loadStart':
      return { status: 'loading', todos: [] };
    case 'loadSuccess':
      return { status: 'success', todos: action.payload };
    case 'loadError':
      return {
        status: 'error',
        todos: [],
        error: action.payload.error,
        requestId: action.payload.requestId,
      };

    case 'addOptimistic': {
      if (state.status !== 'success') return state;
      const { tempId, text, createdAt } = action.payload;
      const optimistic: TodoEntry = {
        id: tempId,
        text,
        completed: false,
        createdAt,
        pending: true,
      };
      return { ...state, todos: [...state.todos, optimistic] };
    }

    case 'addReconcile': {
      if (state.status !== 'success') return state;
      const { tempId, todo } = action.payload;
      const idx = state.todos.findIndex((t) => t.id === tempId);
      if (idx === -1) return state;
      const next = state.todos.slice();
      // Server `Todo` — `pending` flag absent by definition. Any prior
      // `pending: true` on the optimistic entry is dropped via replacement.
      next[idx] = todo;
      return { ...state, todos: next };
    }

    case 'addFailed': {
      if (state.status !== 'success') return state;
      const { tempId } = action.payload;
      const next = state.todos.filter((t) => t.id !== tempId);
      if (next.length === state.todos.length) return state;
      return { ...state, todos: next };
    }

    case 'toggleOptimistic': {
      if (state.status !== 'success') return state;
      const { id, completed } = action.payload;
      const idx = state.todos.findIndex((t) => t.id === id);
      if (idx === -1) return state;
      const target = state.todos[idx]!;
      if (target.completed === completed) return state;
      const next = state.todos.slice();
      next[idx] = { ...target, completed };
      return { ...state, todos: next };
    }

    case 'toggleFailed': {
      if (state.status !== 'success') return state;
      const { id, previousCompleted } = action.payload;
      const idx = state.todos.findIndex((t) => t.id === id);
      if (idx === -1) return state;
      const target = state.todos[idx]!;
      if (target.completed === previousCompleted) return state;
      const next = state.todos.slice();
      next[idx] = { ...target, completed: previousCompleted };
      return { ...state, todos: next };
    }

    case 'deleteOptimistic': {
      if (state.status !== 'success') return state;
      const { id } = action.payload;
      const next = state.todos.filter((t) => t.id !== id);
      if (next.length === state.todos.length) return state;
      return { ...state, todos: next };
    }

    case 'deleteFailed': {
      if (state.status !== 'success') return state;
      const { todo, index } = action.payload;
      // Defensive bounds check — caller's stashed pre-delete index may be
      // out-of-bounds if state has shrunk further (concurrent deletes).
      const clamped = Math.max(0, Math.min(index, state.todos.length));
      const next = state.todos.slice();
      next.splice(clamped, 0, todo);
      return { ...state, todos: next };
    }

    default: {
      // Compile-time exhaustiveness: adding a TodoAction member without a case
      // narrows `action` away from `never` here and fails `tsc --noEmit`.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
