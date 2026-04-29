'use client';

export default function TodoApp() {
  return (
    <section aria-labelledby="todos-heading" className="flex flex-col gap-6">
      <h1 id="todos-heading" className="text-3xl font-semibold tracking-tight">
        Shared Todos
      </h1>
      <div
        data-testid="todo-list-placeholder"
        className="rounded-md border border-current/10 px-4 py-8 text-center text-sm opacity-70"
      >
        The list will appear here.
      </div>
    </section>
  );
}
