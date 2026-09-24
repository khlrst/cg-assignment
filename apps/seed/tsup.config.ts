import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  bundle: true,
  noExternal: [
    '@cg-assignment/evm',
    '@cg-assignment/db',
  ],
  external: [
    'ethers',
    'abitype',
    'pg',
    'drizzle-orm',
    'winston',
    'zod',
  ],
  splitting: false,
  treeshake: true,
  minify: false,
  sourcemap: false,
  dts: false,
  clean: true,
});
