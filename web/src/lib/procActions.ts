// Lifecycle actions on processes with the right confirmations.
import { api, enc } from './api';
import { useAction, useFeedback } from './feedback';

export type ProcAction = 'stop' | 'restart' | 'reload' | 'delete' | 'reset' | 'flush' | 'scale' | 'signal' | 'trigger' | 'inspect' | 'stdin';

const PAST: Record<string, string> = {
  stop: 'Stopped',
  restart: 'Restarted',
  reload: 'Reloaded',
  delete: 'Deleted',
  reset: 'Counters reset for',
  flush: 'Flushed logs of',
  scale: 'Scaled',
  signal: 'Signal sent to',
};

export function useProcActions() {
  const { confirm } = useFeedback();
  const { busy, run } = useAction();

  // target: pm_id, app name, namespace or "all"; label is what the user sees.
  const act = async (target: string | number, action: ProcAction, body: object = {}, label = String(target)) => {
    const all = target === 'all';
    if (action === 'delete') {
      const ok = await confirm({
        title: all ? 'Delete every process?' : `Delete ${label}?`,
        body: "This stops the process and removes it from pm2's list. Its log files stay on disk.",
        confirmText: 'Delete',
        danger: true,
        typeToConfirm: all ? 'delete all' : undefined,
      });
      if (!ok) return;
    } else if (all && ['stop', 'restart', 'reload', 'flush'].includes(action)) {
      const ok = await confirm({
        title: `${action[0].toUpperCase()}${action.slice(1)} every process?`,
        body: 'This applies to all processes managed by pm2, including ones you did not start from here.',
        confirmText: `${action[0].toUpperCase()}${action.slice(1)} all`,
        danger: action === 'stop' || action === 'flush',
        typeToConfirm: action === 'stop' ? 'stop all' : undefined,
      });
      if (!ok) return;
    } else if (action === 'flush') {
      const ok = await confirm({
        title: `Flush logs of ${label}?`,
        body: 'The out and error log files are emptied. This cannot be undone.',
        confirmText: 'Flush',
        danger: true,
      });
      if (!ok) return;
    }
    return run(
      `${target}:${action}`,
      () => api.post(`/api/processes/${enc(String(target))}/${action}`, body),
      PAST[action] ? `${PAST[action]} ${label}` : undefined,
    );
  };

  return { act, busy };
}
