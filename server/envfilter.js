// pm2 merges the launching shell's environment into every app's env. These
// helpers separate the app's own variables from inherited shell noise.
const SHELL_VARS = /^(PATH|HOME|SHELL|PWD|OLDPWD|USER|LOGNAME|TMPDIR|TEMP|TMP|LANG|LANGUAGE|LC_\w+|SHLVL|_|TERM\w*|COLORTERM|COLORFGBG|LS_?COLORS|LSCOLORS|ZSH|LESS|PAGER|EDITOR|VISUAL|MANPATH|INFOPATH|FPATH|DISPLAY|SSH_\w+|XPC_\w+|__CF\w+|__\w+|ITERM\w*|TERM_\w+|CONDA\w*|_CONDA\w*|_?P9K\w*|HOMEBREW_\w+|COMMAND_MODE|OSLogRateLimit|MallocNanoZone|GSETTINGS\w*|BUN_INSTALL|NVM_\w+|PNPM_HOME|VSCODE_\w+|npm_\w+|NODE_APP_INSTANCE|unique_id|PM2_\w+|LC_TERMINAL\w*)$/;

export function isInherited(key, value, appName) {
  if (key === appName) return true; // pm2 adds <name>=<json> to env
  if (SHELL_VARS.test(key)) return true;
  return process.env[key] !== undefined && process.env[key] === String(value);
}

export function ownEnv(env = {}, appName) {
  return Object.fromEntries(Object.entries(env).filter(([k, v]) => !isInherited(k, v, appName)));
}

export function inheritedKeys(env = {}, appName) {
  return Object.keys(env).filter((k) => isInherited(k, env[k], appName));
}
