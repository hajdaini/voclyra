import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@main': fromRoot('./src/main'),
      '@preload': fromRoot('./src/preload'),
      '@renderer': fromRoot('./src/renderer/src'),
      '@shared': fromRoot('./src/shared'),
      '@services': fromRoot('./src/services'),
      '@storage': fromRoot('./src/storage'),
      '@styles': fromRoot('./src/styles'),
      '@assets': fromRoot('./src/assets'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main/index.ts',
        'src/main/security.ts',
        'src/main/tray.ts',
        'src/main/window.ts',
        'src/preload/index.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/api.ts',
        'src/renderer/src/audio/**',
        'src/renderer/src/ui/App.tsx',
        'src/renderer/src/ui/components/**',
        'src/renderer/src/ui/views/**',
      ],
    },
    restoreMocks: true,
  },
});
