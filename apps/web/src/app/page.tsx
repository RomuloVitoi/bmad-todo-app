import TodoApp from '@/components/TodoApp';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col mx-auto w-full max-w-2xl px-4 py-12 md:py-16">
      <TodoApp />
    </main>
  );
}
