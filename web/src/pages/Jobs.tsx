// History of pm2 CLI commands run from the dashboard, with live output.
import { useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import { Card, Empty, PageHeader } from '../components/ui';
import { JobConsole } from '../components/JobConsole';
import { JobList } from '../components/JobsDrawer';
import { useJobs } from '../lib/store';

export default function JobsPage() {
  const jobs = useJobs();
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? jobs[0]?.id ?? null;
  return (
    <>
      <PageHeader title="Jobs" subtitle="pm2 commands that print output (installs, deploys, startup, reports…) run here as jobs" />
      {jobs.length === 0 ? (
        <Card>
          <Empty icon={<TerminalSquare className="size-8" />} title="No jobs yet">
            Installing a module, deploying, or enabling startup will show its output here.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="flex max-h-[75vh] flex-col">
            <JobList jobs={jobs} selected={current} onSelect={setSelected} />
          </div>
          <Card>{current && <JobConsole key={current} id={current} height="h-[60vh]" />}</Card>
        </div>
      )}
    </>
  );
}
