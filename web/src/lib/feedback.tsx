// Toasts, confirmation dialogs, and a helper to run API actions with feedback.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, Modal } from '../components/ui';

type Tone = 'info' | 'success' | 'error' | 'warning';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  typeToConfirm?: string;
}

interface FeedbackCtx {
  toast: (t: Omit<Toast, 'id'>) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackCtx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );

  const confirm = useCallback((o: ConfirmOptions) => {
    setTyped('');
    return new Promise<boolean>((resolve) => setPending({ ...o, resolve }));
  }, []);

  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  const icons = {
    info: <Info className="size-4 text-accent" />,
    success: <CheckCircle2 className="size-4 text-good" />,
    warning: <AlertTriangle className="size-4 text-warning" />,
    error: <XCircle className="size-4 text-critical" />,
  };

  const blocked = !!pending?.typeToConfirm && typed !== pending.typeToConfirm;

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-lg">
            <div className="mt-0.5">{icons[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-4 text-xs break-words text-ink-2">{t.body}</p>}
              {t.action && (
                <button className="mt-1 text-xs font-medium text-accent hover:underline cursor-pointer" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="text-muted hover:text-ink cursor-pointer" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus>
              {pending?.confirmText || 'Confirm'}
            </Button>
          </>
        }
      >
        {pending?.body && <div className="text-[13px] text-ink-2">{pending.body}</div>}
        {pending?.typeToConfirm && (
          <div className="mt-3">
            <label className="label">
              Type <code className="rounded bg-surface-2 px-1 font-mono text-ink">{pending.typeToConfirm}</code> to confirm
            </label>
            <input
              className="input font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !blocked && close(true)}
              autoFocus
            />
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('FeedbackProvider missing');
  return ctx;
}

// Wraps an async action with a busy flag, success toast and error toast.
export function useAction() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string | undefined)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        const msg = typeof success === 'function' ? success(r) : success;
        if (msg) toast({ tone: 'success', title: msg });
        return r;
      } catch (err: any) {
        toast({ tone: 'error', title: 'Action failed', body: err?.message || String(err) });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}
