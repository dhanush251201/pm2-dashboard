// pm2 deploy <file> <env> setup|update|revert|curr|prev|list|exec|<ref>
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { Button, Card, Empty, Field, KV, PageHeader, Spinner, Toggle } from '../components/ui';
import { PathInput } from '../components/PathInput';
import { useJobPanel } from '../components/JobsDrawer';
import { useFetch } from '../lib/useFetch';
import { useFeedback } from '../lib/feedback';
import { api, enc } from '../lib/api';

interface DeployEnv {
  host?: string | string[];
  ref?: string;
  repo?: string;
  path?: string;
  user?: string;
}

const SAMPLE = `module.exports = {
  apps: [{ name: 'api', script: 'server.js' }],
  deploy: {
    production: {
      user: 'deploy',
      host: ['203.0.113.10'],
      ref: 'origin/main',
      repo: 'git@github.com:you/api.git',
      path: '/var/www/api',
      'post-deploy': 'npm ci && pm2 startOrReload ecosystem.config.js --env production',
    },
  },
};`;

function EnvCard({ file, name, env }: { file: string; name: string; env: DeployEnv }) {
  const { start } = useJobPanel();
  const { confirm } = useFeedback();
  const [force, setForce] = useState(false);
  const [revertN, setRevertN] = useState('1');
  const [execCmd, setExecCmd] = useState('');
  const [ref, setRef] = useState('');
  const go = (command: string, arg?: string) => start(() => api.post('/api/deploy', { path: file, env: name, command, arg, force }));

  return (
    <Card title={name} subtitle={Array.isArray(env.host) ? env.host.join(', ') : env.host}>
      <KV
        items={[
          ['user', env.user],
          ['repo', env.repo],
          ['ref', env.ref],
          ['remote path', env.path],
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => go('setup')}>Setup</Button>
        <Button variant="primary" icon={<Rocket className="size-3.5" />} onClick={() => go('update')}>
          Deploy latest
        </Button>
        <Button onClick={() => go('curr')}>Current commit</Button>
        <Button onClick={() => go('prev')}>Previous commit</Button>
        <Button onClick={() => go('list')}>List deploys</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Field label="Revert N deploys back">
          <div className="flex gap-2">
            <input className="input w-20" type="number" min={1} value={revertN} onChange={(e) => setRevertN(e.target.value)} />
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: `Revert ${name} by ${revertN} deploy(s)?`, confirmText: 'Revert', danger: true })) go('revert', revertN);
              }}
            >
              Revert
            </Button>
          </div>
        </Field>
        <Field label="Deploy a specific ref">
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="tag or commit" value={ref} onChange={(e) => setRef(e.target.value)} />
            <Button disabled={!ref.trim()} onClick={() => go('ref', ref.trim())}>
              Deploy
            </Button>
          </div>
        </Field>
        <Field label="Run a command on the hosts">
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="pm2 reload all" value={execCmd} onChange={(e) => setExecCmd(e.target.value)} />
            <Button disabled={!execCmd.trim()} onClick={() => go('exec', execCmd.trim())}>
              Exec
            </Button>
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <Toggle checked={force} onChange={setForce} label="--force" hint="Deploy even if the local repo has uncommitted changes" />
      </div>
    </Card>
  );
}

export default function DeployPage() {
  const files = useFetch<{ recent: string[]; discovered: string[] }>('/api/ecosystem/files');
  const [file, setFile] = useState('');
  const [deploy, setDeploy] = useState<Record<string, DeployEnv> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !files.data) return;
    prefilled.current = true;
    setFile(files.data.recent[0] || files.data.discovered[0] || '');
  }, [files.data]);

  useEffect(() => {
    setDeploy(null);
    setError(null);
    if (!file) return;
    // debounce while the path is being typed
    const t = setTimeout(() => {
      setLoading(true);
      api
        .get<{ deploy: Record<string, DeployEnv> }>(`/api/ecosystem/parsed?path=${enc(file)}`)
        .then((r) => setDeploy(r.deploy))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [file]);

  const known = [...(files.data?.recent ?? []), ...(files.data?.discovered ?? [])];

  return (
    <>
      <PageHeader title="Deploy" subtitle="pm2's built-in git + SSH deployment, driven by the deploy section of an ecosystem file" />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Ecosystem file">
            <PathInput value={file} onChange={setFile} filter={/(\.json|\.ya?ml|\.config\.[cm]?js)$/} placeholder="/path/to/ecosystem.config.js" />
          </Field>
          {known.length > 0 && (
            <Field label="Known files">
              <select className="input" value={known.includes(file) ? file : ''} onChange={(e) => setFile(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {known.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-[13px] text-critical-ink">{error}</p>
      ) : !file ? (
        <Card>
          <Empty icon={<Rocket className="size-8" />} title="Choose an ecosystem file with a deploy section" />
        </Card>
      ) : deploy && Object.keys(deploy).length === 0 ? (
        <Card title="This file has no deploy section">
          <p className="mb-3 text-[13px] text-ink-2">
            Add a <code className="font-mono">deploy</code> block like this (then run Setup once per environment). You can edit the file on the{' '}
            <Link to="/ecosystem" className="text-accent hover:underline">
              Ecosystem page
            </Link>
            .
          </p>
          <pre className="overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{SAMPLE}</pre>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {deploy && Object.entries(deploy).map(([name, env]) => <EnvCard key={name} file={file} name={name} env={env} />)}
        </div>
      )}
    </>
  );
}
