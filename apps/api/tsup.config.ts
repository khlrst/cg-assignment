import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  bundle: true,
  splitting: false,
  treeshake: true,
  minify: false,
  sourcemap: false,
  dts: false,
  clean: true,
});
