import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname),
            '@apps': path.resolve(__dirname, 'apps'),
            '@components': path.resolve(__dirname, 'apps/components'),
            '@pages': path.resolve(__dirname, 'pages'),
            '@layout': path.resolve(__dirname, 'pages/layout'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./apps/test/setup.ts'],
        include: [
            'apps/**/__tests__/**/*.test.{ts,tsx}',
            'apps/**/*.test.{ts,tsx}',
        ],
        exclude: ['node_modules', 'dist'],
        testTimeout: 10000,
    },
})
