// Flat config. The app ships as ES modules straight to the browser with no
// build step, so the rules here are about catching what a browser would only
// tell you at runtime — undefined variables, unreachable code, a stale import —
// rather than enforcing a formatter.

const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  localStorage: 'readonly', sessionStorage: 'readonly', history: 'readonly', console: 'readonly',
  fetch: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', Intl: 'readonly', crypto: 'readonly', caches: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', structuredClone: 'readonly', alert: 'readonly',
  confirm: 'readonly', prompt: 'readonly', MutationObserver: 'readonly', DragEvent: 'readonly',
  DataTransfer: 'readonly', Image: 'readonly', getComputedStyle: 'readonly', CustomEvent: 'readonly',
};

const nodeGlobals = {
  require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly',
};

const shared = {
  // ignoreRestSiblings: `const { kind, position, ...rest } = row` is how this
  // codebase strips keys, and those bindings are deliberately unused.
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-undef': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': ['error', { boolean: false }],
  'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
  'no-alert': 'warn',      // tracked as its own gap; warn so it can't grow
};

module.exports = [
  { ignores: ['node_modules/**', 'tests/.tmp/**', 'vendor/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: shared,
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', console: 'readonly', clients: 'readonly' },
    },
    rules: shared,
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      // Browser globals too: the bodies of page.evaluate() callbacks are
      // written here but run in the page, where these exist.
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: { ...shared, 'no-console': 'off', 'no-alert': 'off' },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...nodeGlobals, ...browserGlobals } },
    rules: { ...shared, 'no-console': 'off' },
  },
];
