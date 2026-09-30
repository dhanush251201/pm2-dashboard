// Small persistent state for the dashboard itself (~/.pm2-dashboard).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STATE_DIR = process.env.PM2_DASHBOARD_HOME || path.join(os.homedir(), '.pm2-dashboard');
export const PROFILES_DIR = path.join(STATE_DIR, 'profiles');
fs.mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 });

const STATE_FILE = path.join(STATE_DIR, 'state.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function getState(key, fallback) {
  return read()[key] ?? fallback;
}

export function setState(key, value) {
  const s = read();
  s[key] = value;
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

// Keep a most-recently-used list (e.g. ecosystem files).
export function pushRecent(key, value, max = 15) {
  const list = getState(key, []).filter((v) => v !== value);
  list.unshift(value);
  setState(key, list.slice(0, max));
}
