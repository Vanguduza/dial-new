import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tests/e2e is Playwright's. Without this exclusion vitest collects the
    // spec files, fails to resolve @playwright/test's runner and reports a
    // suite failure that has nothing to do with the code under test.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
