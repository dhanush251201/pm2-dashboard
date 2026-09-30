import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';

function useDark() {
  const get = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(get());
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      obs.disconnect();
    };
  }, []);
  return dark;
}

export function CodeEditor({
  value,
  onChange,
  language = 'js',
  height = '420px',
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  language?: 'js' | 'json' | 'text';
  height?: string;
  readOnly?: boolean;
}) {
  const dark = useDark();
  const ext = language === 'json' ? [json()] : language === 'js' ? [javascript()] : [];
  return (
    <div className="overflow-hidden rounded-lg border border-line text-[12.5px]">
      <CodeMirror value={value} onChange={onChange} extensions={ext} theme={dark ? 'dark' : 'light'} height={height} readOnly={readOnly} />
    </div>
  );
}
