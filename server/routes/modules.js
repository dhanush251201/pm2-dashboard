// pm2 modules: list, install, uninstall, update, generate, package, publish.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getSnapshot } from '../metrics.js';
import { runPm2 } from '../jobs.js';
import { badRequest } from '../errors.js';

const require = createRequire(import.meta.url);
const Configuration = require('pm2/lib/Configuration.js');

const MODULE_NAME = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~<>=-]+)?$|^(git\+|https?:|git:|github:)[\w:/.@#+-]+$/;

function requireDir(dir) {
  if (!dir || !path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw badRequest('an existing absolute directory is required');
  }
  return dir;
}

export default async function moduleRoutes(app) {
  app.get('/api/modules', async () => {
    const all = Configuration.getAllSync() || {};
    const db = all['module-db-v2'] || all['module-db'] || {};
    const running = getSnapshot().filter((p) => p.is_module);
    const names = new Set([...Object.keys(db), ...running.map((p) => p.name)]);
    return [...names].map((name) => ({
      name,
      installed: db[name] || null,
      processes: running.filter((p) => p.name === name),
      config: all[name] && typeof all[name] === 'object' ? all[name] : {},
    }));
  });

  app.post('/api/modules/install', async (req) => {
    const { name, safe, tarball, yarnInstall } = req.body || {};
    if (!name || !(MODULE_NAME.test(name) || (tarball && path.isAbsolute(name)))) throw badRequest('invalid module name');
    const args = ['install', name];
    if (tarball) args.push('--tarball');
    if (yarnInstall) args.push('--install');
    if (safe) args.push('--safe', String(parseInt(safe, 10) || 30000));
    return runPm2(args);
  });

  app.post('/api/modules/uninstall', async (req) => {
    const { name } = req.body || {};
    if (!name || !MODULE_NAME.test(name)) throw badRequest('invalid module name');
    return runPm2(['uninstall', name]);
  });

  app.post('/api/modules/update', async (req) => {
    const { name } = req.body || {};
    if (!name || !MODULE_NAME.test(name)) throw badRequest('invalid module name');
    return runPm2(['module:update', name]);
  });

  app.post('/api/modules/generate', async (req) => {
    const { name, dir } = req.body || {};
    if (!name || !/^[\w.-]+$/.test(name)) throw badRequest('invalid module name');
    return runPm2(['module:generate', name], { cwd: requireDir(dir) });
  });

  app.post('/api/modules/package', async (req) => {
    const { dir } = req.body || {};
    return runPm2(['package', requireDir(dir)], { cwd: dir });
  });

  app.post('/api/modules/publish', async (req) => {
    const { dir, npm } = req.body || {};
    const args = ['publish'];
    if (npm) args.push('--npm');
    args.push(requireDir(dir));
    return runPm2(args, { cwd: dir });
  });
}
