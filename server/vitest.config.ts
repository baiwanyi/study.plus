import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
    test: {
        environment: 'node',
        include: ['__test__/**/*.test.ts'],
        setupFiles: ['./__test__/setup.ts'],
        // 每个测试文件独立进程，保证内存库数据相互隔离（满足数据隔离要求）
        pool: 'forks',
        testTimeout: 20000,
        hookTimeout: 20000,
    },
    resolve: {
        alias: {
            '@shared/utils': fileURLToPath(new URL('../shared/src/utils.ts', import.meta.url)),
            '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
            '@shared/*': fileURLToPath(new URL('../shared/src/*', import.meta.url)),
        },
    },
    root: rootDir,
})
