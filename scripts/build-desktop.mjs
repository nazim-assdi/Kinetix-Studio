import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-electron', { recursive: true });
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  packages: 'external',
  external: ['electron'],
  sourcemap: false,
  minify: true,
};
await Promise.all([
  build({ ...shared, entryPoints: ['desktop/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...shared, entryPoints: ['desktop/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
