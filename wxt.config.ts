import { defineConfig } from 'wxt';

import { manifest } from './src/lib/manifest';

// WXT >= 0.20 registers modules by package name; the React module contributes
// the Vite React plugin and the JSX import preset.
//
// Everything is bundled: no module is loaded from a remote origin, and the
// extension never evaluates strings (the audit script asserts both).
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest,
});
