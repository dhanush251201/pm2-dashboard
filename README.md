# PM2 Dashboard

A locally running website for pm2 that covers everything the pm2 CLI can do:
start and manage processes, live logs and metrics, a browser terminal attached to
a process, ecosystem files, deploys, modules, startup scripts, and daemon admin.

It talks to the pm2 daemon that is already running on your machine (`~/.pm2`),
so anything you do here shows up in `pm2 ls` and vice versa.

## Quick start

```bash
npm install
npm run build     # builds the React UI into web/dist
npm start         # serves UI + API on http://127.0.0.1:9700
```

Open the URL printed in the terminal (it contains a one-time access token, which
the page swaps for a cookie). The token is stored in `~/.pm2-dashboard/token`;
delete that file and restart to revoke existing sessions.

### Development

```bash
npm run dev       # API on :9700 (auto-restarts) + Vite on :5173 with hot reload
```

Open the `http://localhost:5173/?t=…` URL the server prints.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PM2_DASHBOARD_PORT` | `9700` | API/UI port (always bound to 127.0.0.1) |
| `VITE_PORT` | `5173` | Vite dev server port (`npm run dev`) |
| `PM2_HOME` | `~/.pm2` | Which pm2 daemon to manage |
| `PM2_DASHBOARD_HOME` | `~/.pm2-dashboard` | Token, recent files, profiles |

To try it against a throwaway daemon instead of your real one, point `PM2_HOME`
at an empty folder (keep the path short — pm2 uses unix sockets in it).

## What's where

| pm2 command | In the dashboard |
|---|---|
| `ls`, `jlist`, `prettylist` | **Processes** (live table, sparklines) · Raw JSON tab |
| `start <script>` (all options), `serve` | **Start process** (form with live ecosystem preview; static server tab) |
| `stop` / `restart` / `reload` / `delete` / `reset` | Row actions, bulk selection, namespace and "All processes" menus |
| `scale` | Row menu → Scale instances, detail → More |
| `describe`, `env`, `id`, `pid` | **Process detail** → Overview / Environment |
| `logs`, `flush`, `reloadLogs` | **Logs** page and detail → Logs (live + history, filter, regex, download) |
| `monit`, `dashboard` | **Metrics** page and detail → Metrics |
| `attach`, `send` | Detail → **Terminal** (xterm.js; Enter sends a line to stdin, Ctrl+C sends SIGINT) |
| `sendSignal`, `trigger`, `inspect` | Detail → Signals & actions |
| `pull`, `forward`, `backward` | Detail → Git |
| `startOrRestart`, `startOrReload`, `start/stop/delete <file>`, `init`/`ecosystem` | **Ecosystem** (edit, apply with `--only`/`--env`/`--update-env`, generate, export running processes) |
| `deploy` | **Deploy** (setup, update, revert, current, previous, list, exec, ref) |
| `install` / `uninstall` / `module:update` / `module:generate` / `package` / `publish`, `conf` | **Modules** |
| `save`, `resurrect`, `cleardump`, `startup`, `unstartup`, `logrotate`, `set`/`get`/`unset`/`multiset`, `sysmonit`/`slist`, `profile:*`, `report`, `update`, `deepUpdate`, `kill`, `ping`, `link`/`unlink`/`logout` | **System** |

Commands that mostly print text (installs, deploys, startup, reports, …) run as
**jobs**: their output streams live into the Jobs drawer (top bar) and the Jobs page.

Also: crash / crash-loop toasts and optional desktop notifications, an event
timeline, a ⌘K command palette, and light/dark themes.

## Things pm2 can't do from a browser

- **`pm2 startup` needs sudo.** The dashboard runs it, then shows the exact
  `sudo …` command with a Copy button for you to run in a terminal.
- **`pm2 login` is interactive.** Use *Link this machine* with your PM2 Plus
  secret/public keys instead (equivalent to `pm2 link`).

## Security

- Listens on `127.0.0.1` only.
- Every request must carry the token cookie (httpOnly, SameSite=Strict).
- The `Host` header must be a loopback name (blocks DNS rebinding) and any
  `Origin` must be a loopback origin (blocks other websites).

## Running the dashboard under pm2

You can, but remember it then depends on the daemon it manages — *Kill daemon*
also stops the dashboard. Running it with plain `npm start` (or a launchd/systemd
unit) keeps it available to restart pm2.

```bash
npm run build
pm2 start server/index.js --name pm2-dashboard
```

## Architecture

```
Browser (React + Vite, Tailwind, uPlot, xterm.js, CodeMirror)
   │  REST /api/*      actions
   │  WS   /ws         channels: processes, metrics, events, jobs, logs:<id|all>, job:<id>
   ▼
Fastify server (server/)
   ├─ pm2client.js   pm2 programmatic API, reconnects after the daemon restarts
   ├─ bus.js         pm2 event bus → logs, lifecycle events, exceptions
   ├─ metrics.js     polls the process list every 2s, keeps 15 min of history
   ├─ jobs.js        runs pm2 CLI commands and streams their output
   └─ routes/        processes, system, modules, ecosystem/deploy/fs
```

Note: pm2 6 installs modules with `bun` when it is on your PATH, and bun then
installs into the nearest `package.json` instead of the module folder. The
dashboard hides bun from pm2 during module installs so pm2 uses npm.
