// Reads historical log lines from pm2 log files.
import fs from 'node:fs';
import readline from 'node:readline';

const CHUNK = 64 * 1024;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;

// Last `lines` lines of a file, reading backwards from the end.
export async function tail(file, lines = 500) {
  let fh;
  try {
    fh = await fs.promises.open(file, 'r');
  } catch {
    return [];
  }
  try {
    const { size } = await fh.stat();
    let pos = size;
    let text = '';
    let newlines = 0;
    while (pos > 0 && newlines <= lines && size - pos < MAX_TAIL_BYTES) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, pos);
      const chunk = buf.toString('utf8');
      for (const c of chunk) if (c === '\n') newlines++;
      text = chunk + text;
    }
    const out = text.split('\n');
    if (out.at(-1) === '') out.pop();
    if (pos > 0) out.shift(); // first line is likely partial
    return out.slice(-lines);
  } finally {
    await fh.close();
  }
}

// Scan a file for lines matching a query (plain substring or /regex/flags).
export async function search(file, query, { limit = 1000 } = {}) {
  let test;
  const re = /^\/(.+)\/([a-z]*)$/.exec(query);
  if (re) {
    const rx = new RegExp(re[1], re[2].replace('g', ''));
    test = (l) => rx.test(l);
  } else {
    const q = query.toLowerCase();
    test = (l) => l.toLowerCase().includes(q);
  }
  if (!fs.existsSync(file)) return { matches: [], truncated: false };
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const matches = [];
  let lineNo = 0;
  let truncated = false;
  for await (const line of rl) {
    lineNo++;
    if (test(line)) {
      matches.push({ line: lineNo, text: line });
      if (matches.length >= limit) {
        truncated = true;
        rl.close();
        break;
      }
    }
  }
  return { matches, truncated };
}

export function fileInfo(file) {
  try {
    const st = fs.statSync(file);
    return { path: file, size: st.size, mtime: st.mtimeMs };
  } catch {
    return { path: file, size: 0, mtime: null, missing: true };
  }
}
