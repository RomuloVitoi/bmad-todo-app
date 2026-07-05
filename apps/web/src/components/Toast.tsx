'use client';

// Aliased — this file's own default export is also named `Toast`;
// importing the Radix namespace as `Toast` would collide with it.
import * as ToastPrimitive from '@radix-ui/react-toast';
import type { ToastEntry } from '@/lib/reducer';

export interface ToastProps {
  toast: ToastEntry | null;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <ToastPrimitive.Provider duration={5000}>
      {toast !== null && (
        <ToastPrimitive.Root
          key={toast.id}
          data-testid="toast-root"
          open
          onOpenChange={(open) => {
            if (!open) onDismiss();
          }}
          onEscapeKeyDown={onDismiss}
          className="flex items-center gap-3 rounded-md border border-current/10 bg-[var(--background)] px-4 py-3 shadow-lg"
        >
          <ToastPrimitive.Description
            data-testid="toast-description"
            className="flex-1 text-sm leading-6"
          >
            {toast.message}
          </ToastPrimitive.Description>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            data-testid="toast-dismiss"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current/10 bg-transparent outline-none hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/40"
          >
            <span aria-hidden="true">×</span>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      )}
      <ToastPrimitive.Viewport
        data-testid="toast-viewport"
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 outline-none"
      />
    </ToastPrimitive.Provider>
  );
}
