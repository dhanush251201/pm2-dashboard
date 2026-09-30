// Per-browser conveniences (safe if storage is unavailable).
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked
  }
}

export const notificationsEnabled = () => read('pm2dash-notify') === '1';
export const setNotificationsEnabled = (on: boolean) => write('pm2dash-notify', on ? '1' : null);
