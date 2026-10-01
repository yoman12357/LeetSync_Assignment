export const GITHUB = Object.freeze({
  apiBase: 'https://api.github.com',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  oauthServerUrl: globalThis.__LEETSYNC_OAUTH_SERVER_URL__ || 'http://localhost:3000',
  scopes: 'repo read:user',
});

export const MESSAGE = Object.freeze({
  authStart: 'AUTH_START',
  authLogout: 'AUTH_LOGOUT',
  authValidate: 'AUTH_VALIDATE',
  repoList: 'REPO_LIST',
  repoSelect: 'REPO_SELECT',
  repoCreate: 'REPO_CREATE',
  settingsSave: 'SETTINGS_SAVE',
  statusGet: 'STATUS_GET',
  submissionAccepted: 'SUBMISSION_ACCEPTED',
});

export const STORAGE = Object.freeze({
  authToken: 'leetsync_auth_token',
  user: 'leetsync_user',
  repository: 'leetsync_repository',
  fingerprints: 'leetsync_fingerprints',
  history: 'leetsync_history',
  settings: 'leetsync_settings',
  oauthPending: 'leetsync_oauth_pending',
});

export const DEFAULT_SETTINGS = Object.freeze({
  autoSync: true,
  generateReadme: true,
  includePerformance: true,
  commitPrefix: 'LeetSync',
});

export const LANGUAGE_EXTENSIONS = Object.freeze({
  bash: 'sh', c: 'c', 'c#': 'cs', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs',
  dart: 'dart', elixir: 'ex', erlang: 'erl', go: 'go', golang: 'go', java: 'java',
  javascript: 'js', kotlin: 'kt', lua: 'lua', mssql: 'sql', mysql: 'sql',
  oracle: 'sql', perl: 'pl', php: 'php', python: 'py', python3: 'py', r: 'r',
  racket: 'rkt', ruby: 'rb', rust: 'rs', scala: 'scala', shell: 'sh', sql: 'sql',
  swift: 'swift', typescript: 'ts',
});

export const LANGUAGE_NAMES = Object.freeze({
  c: 'C', cpp: 'C++', cs: 'C#', dart: 'Dart', ex: 'Elixir', erl: 'Erlang',
  go: 'Go', java: 'Java', js: 'JavaScript', kt: 'Kotlin', lua: 'Lua', php: 'PHP',
  pl: 'Perl', py: 'Python', r: 'R', rb: 'Ruby', rkt: 'Racket', rs: 'Rust',
  scala: 'Scala', sh: 'Shell', sql: 'SQL', swift: 'Swift', ts: 'TypeScript',
});

export const RETRY = Object.freeze({ attempts: 3, baseDelayMs: 400, maxDelayMs: 4000 });
export const LIMITS = Object.freeze({ fingerprints: 500, history: 20, sourceBytes: 750_000 });
