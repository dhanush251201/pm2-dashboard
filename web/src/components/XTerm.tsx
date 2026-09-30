// xterm.js wrapper. The parent receives the Terminal instance via onReady.
import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

function theme(): ITheme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  const dark = s.colorScheme === 'dark' || document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return {
    background: v('--term-bg'),
    foreground: v('--term-fg'),
    cursor: v('--accent'),
    selectionBackground: dark ? '#3987e555' : '#2a78d633',
    black: dark ? '#2c2c2a' : '#1f1f1d',
    red: dark ? '#e66767' : '#c13535',
    green: dark ? '#3ec13e' : '#067a06',
    yellow: dark ? '#fab219' : '#8a5a00',
    blue: dark ? '#6da7ec' : '#1c5cab',
    magenta: dark ? '#d55181' : '#a8336a',
    cyan: dark ? '#2cc5a0' : '#0f7d5a',
    white: dark ? '#e8e7e1' : '#52514e',
    brightBlack: '#898781',
  };
}

export function XTerm({
  onReady,
  onData,
  className = '',
  cursor = false,
}: {
  onReady: (t: Terminal) => void | (() => void);
  onData?: (data: string) => void;
  className?: string;
  cursor?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const dataRef = useRef(onData);
  dataRef.current = onData;

  useEffect(() => {
    if (!el.current) return;
    const term = new Terminal({
      convertEol: true,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 10000,
      cursorBlink: cursor,
      cursorStyle: cursor ? 'bar' : 'underline',
      cursorInactiveStyle: cursor ? 'outline' : 'none',
      disableStdin: !cursor,
      theme: theme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el.current);
    const refit = () => {
      try {
        fit.fit();
      } catch {
        // element not visible yet
      }
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(el.current);
    const sub = term.onData((d) => dataRef.current?.(d));
    const cleanup = onReady(term);

    const retheme = () => (term.options.theme = theme());
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', retheme);
    const obs = new MutationObserver(retheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      if (typeof cleanup === 'function') cleanup();
      mq.removeEventListener('change', retheme);
      obs.disconnect();
      ro.disconnect();
      sub.dispose();
      term.dispose();
    };
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className={`xterm-wrap overflow-hidden rounded-lg border border-line bg-[var(--term-bg)] ${className}`} />;
}
