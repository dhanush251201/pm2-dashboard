export type ProcStatus = 'online' | 'stopping' | 'stopped' | 'launching' | 'errored' | 'one-launch-status' | string;

export interface Proc {
  pm_id: number;
  name: string;
  namespace: string;
  status: ProcStatus;
  pid: number;
  cpu: number;
  memory: number;
  uptime: number;
  created_at: number;
  restarts: number;
  unstable_restarts: number;
  exec_mode: 'fork_mode' | 'cluster_mode';
  instances: number | string;
  version: string;
  node_version: string;
  interpreter: string;
  script: string;
  cwd: string;
  watch: boolean;
  autorestart: boolean;
  is_module: boolean;
  axm_monitor: Record<string, { value: number | string; unit?: string; type?: string }>;
  axm_actions: { name: string; type: string; arity: number }[];
  versioning: null | {
    type: string;
    branch: string;
    revision: string;
    comment: string;
    url: string;
    unstaged: boolean;
    ahead: boolean;
    next_rev: string | null;
    prev_rev: string | null;
  };
}

export interface Point {
  t: number;
  cpu: number;
  mem: number;
}

export interface LogLine {
  pm_id: number;
  name: string;
  type: 'out' | 'err';
  at: number;
  data: string;
}

export interface PmEvent {
  kind: 'process' | 'exception' | 'daemon';
  event: string;
  manually?: boolean;
  pm_id?: number;
  name?: string;
  namespace?: string;
  status?: string;
  restarts?: number;
  exit_code?: number;
  message?: string;
  at: number;
}

export interface Job {
  id: string;
  title: string;
  command: string;
  cwd: string;
  status: 'running' | 'success' | 'failed' | 'killed' | 'needs_sudo';
  code: number | null;
  startedAt: number;
  endedAt: number | null;
  output?: string;
  sudo: string | null;
}

export interface SystemInfo {
  online: boolean;
  daemonPid: number | null;
  daemonVersion: string | null;
  libVersion: string;
  home: string;
  paths: Record<string, string>;
  host: {
    hostname: string;
    platform: string;
    cpus: number;
    cpuModel: string;
    totalmem: number;
    freemem: number;
    loadavg: number[];
    uptime: number;
    node: string;
    cpu: number;
  };
  dump: { path: string; mtime: number | null; apps: { name: string; script: string; status: string }[] };
  startup: { enabled: boolean; files: string[]; platform: string };
  plus: { linked: boolean; interactorPid: number | null; public_key: string | null; machine_name: string | null; url: string };
  dashboard: { pid: number; node: string };
}
