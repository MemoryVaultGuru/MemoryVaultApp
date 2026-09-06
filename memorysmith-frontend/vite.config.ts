import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The product version, read from this package at build time. It comes from the
 * one place that already carries it, so the number on screen cannot drift from
 * the number that was released: there is nothing to remember to update.
 */
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  /**
   * The test run declares its own API origin.
   *
   * `shared/api/source.ts` throws at module load when `VITE_API_ORIGIN` is
   * missing, which is correct for the application: the interface has no
   * offline mode, and failing loudly at the door beats failing per screen.
   * But a unit test that reaches that module through a component would then
   * pass on a machine with a `.env.local` and fail on one without — which is
   * exactly what happened, green here and red in CI.
   *
   * The value is never used: nothing under test reaches the network. It only
   * keeps the module from refusing to load, and it lives here so no test file
   * has to know, and no CI environment has to be told.
   */
  test: {
    env: { VITE_API_ORIGIN: 'https://api.test.invalid' },
  },
});
