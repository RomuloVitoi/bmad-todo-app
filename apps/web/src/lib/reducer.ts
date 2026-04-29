import type { Todo } from '@todo-app/shared';

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface TodoState {
  status: LoadStatus;
  todos: Todo[];
  error?: string;
  requestId?: string;
}

export type TodoAction =
  | { type: 'loadStart' }
  | { type: 'loadSuccess'; payload: Todo[] }
  | { type: 'loadError'; payload: { error: string; requestId?: string } };

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
    default: {
      // Compile-time exhaustiveness: adding a TodoAction member without a case
      // narrows `action` away from `never` here and fails `tsc --noEmit`.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
