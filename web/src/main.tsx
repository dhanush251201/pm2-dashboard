import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import './index.css';
import { api } from './lib/api';
import { startSocket } from './lib/ws';
import { startStores } from './lib/store';
import { FeedbackProvider } from './lib/feedback';
import { JobPanelProvider } from './components/JobsDrawer';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import ProcessesPage from './pages/Processes';
const ProcessDetailPage = lazy(() => import('./pages/ProcessDetail'));
import LogsPage from './pages/Logs';
import EventsPage from './pages/Events';
import MetricsPage from './pages/Metrics';
const NewProcessPage = lazy(() => import('./pages/NewProcess'));
const EcosystemPage = lazy(() => import('./pages/Ecosystem'));
import DeployPage from './pages/Deploy';
import ModulesPage from './pages/Modules';
import SystemPage from './pages/System';
import JobsPage from './pages/Jobs';

// Read (and strip) the ?t= token once, outside React's effect lifecycle.
const initialToken = (() => {
  const url = new URL(location.href);
  const t = url.searchParams.get('t');
  if (t) {
    url.searchParams.delete('t');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return t;
})();

function Login({ onDone, error }: { onDone: (token: string) => void; error: string | null }) {
  const [token, setToken] = useState('');
  return (
    <div className="flex h-full items-center justify-center p-4">
      <form
        className="w-full max-w-md rounded-xl border border-line bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(token.trim());
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="size-5 text-accent" />
          <h1 className="text-lg font-semibold">Unlock PM2 Dashboard</h1>
        </div>
        <p className="mb-4 text-[13px] text-ink-2">
          Open the link printed in the terminal where the dashboard server is running, or paste the access token from{' '}
          <code className="rounded bg-surface-2 px-1 font-mono text-xs">~/.pm2-dashboard/token</code>.
        </p>
        <input className="input mb-3 font-mono" placeholder="Access token" value={token} onChange={(e) => setToken(e.target.value)} autoFocus aria-label="Access token" />
        {error && <p className="mb-3 text-xs text-critical-ink">{error}</p>}
        <Button variant="primary" type="submit" className="w-full" disabled={!token.trim()}>
          Unlock
        </Button>
      </form>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = async (token: string) => {
    try {
      await api.post('/api/auth', { token });
      setError(null);
      setAuthed(true);
    } catch (e: any) {
      setError(e.message);
      setAuthed(false);
    }
  };

  useEffect(() => {
    if (initialToken) login(initialToken);
    else {
      api.get<{ authed: boolean }>('/api/auth').then((r) => setAuthed(r.authed), () => setAuthed(false));
    }
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener('pm2dash:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pm2dash:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!authed) return;
    startSocket();
    startStores().catch(() => {});
  }, [authed]);

  if (authed === null)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  if (!authed) return <Login onDone={login} error={error} />;

  return (
    <BrowserRouter>
      <FeedbackProvider>
        <JobPanelProvider>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner className="size-6" />
              </div>
            }
          >
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ProcessesPage />} />
              <Route path="process/:id" element={<ProcessDetailPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="metrics" element={<MetricsPage />} />
              <Route path="new" element={<NewProcessPage />} />
              <Route path="ecosystem" element={<EcosystemPage />} />
              <Route path="deploy" element={<DeployPage />} />
              <Route path="modules" element={<ModulesPage />} />
              <Route path="system" element={<SystemPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="*" element={<p className="text-ink-2">Page not found.</p>} />
            </Route>
          </Routes>
          </Suspense>
        </JobPanelProvider>
      </FeedbackProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
