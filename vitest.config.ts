import { defineConfig } from 'vitest/config';

// Unit tests cover the pure shell code (validation, deep links, settings,
// manifest policy). Nothing here needs a browser: the storage and permissions
// adapters are injected, so tests never fake a global `chrome` object.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
