import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastType = 'info' | 'success' | 'warning' | 'error';
interface Toast { id: string; message: string; type: ToastType }

const ToastContext = createContext<((message: string, type?: ToastType) => void) | undefined>(undefined);

const STYLE: Record<ToastType, string> = {
  info: 'bg-slate-800',
  success: 'bg-emerald-600',
  warning: 'bg-amber-600',
  error: 'bg-rose-600',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 print:hidden">
        {toasts.map((t) => (
          <div key={t.id} className={`${STYLE[t.type]} text-white px-4 py-2 rounded-lg shadow-lg text-sm`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
