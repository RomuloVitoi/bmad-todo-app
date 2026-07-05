'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

export interface TodoInputProps {
  onAdd: (text: string) => string;
  failedAdd?: { tempId: string; text: string } | null;
}

export default function TodoInput({
  onAdd,
  failedAdd = null,
}: TodoInputProps) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTempIdRef = useRef<string | undefined>(undefined);

  const isEmpty = value.trim().length === 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (value.trim().length === 0) return;
    lastTempIdRef.current = onAdd(value);
    setValue('');
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (failedAdd !== null && failedAdd.tempId === lastTempIdRef.current) {
      // Only restore into an empty input — never clobber a fresh draft the
      // user started typing after this submission cleared the field. The
      // functional updater reads the latest value without adding `value` to
      // the dependency array (which would re-fire the restore on every keystroke).
      setValue((current) => (current.trim().length === 0 ? failedAdd.text : current));
    }
  }, [failedAdd]);

  return (
    <form
      data-testid="todo-input"
      onSubmit={handleSubmit}
      className="flex gap-2"
    >
      <label htmlFor={inputId} className="sr-only">
        Add a todo
      </label>
      <input
        ref={inputRef}
        id={inputId}
        data-testid="todo-input-field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What needs to be done?"
        autoComplete="off"
        className="flex-1 rounded-md border border-current/10 px-3 py-2 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-current/40"
      />
      <button
        type="submit"
        data-testid="todo-input-submit"
        disabled={isEmpty}
        className="rounded-md border border-current/10 px-4 py-2 text-sm font-medium hover:bg-current/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-current/40"
      >
        Add
      </button>
    </form>
  );
}
