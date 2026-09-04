import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// drizzle-kit 在运行时（api.mjs）隐式依赖 drizzle-orm，但其 package.json 的 dependencies
// 并未声明它，pnpm 严格模式不会把 drizzle-orm 链接进 drizzle-kit 的虚拟目录；e2e 测试经
// vitest 的 vite-node 解析 'drizzle-orm' 即报 “Cannot find package”。将 drizzle-orm 及
// 其子路径重定向到 server 实际安装的包目录，仅影响测试解析路径，不改动依赖布局。
const drizzleOrmDir = fileURLToPath(new URL('./node_modules/drizzle-orm', import.meta.url))
// 共享源码目录，供下方 @shared 别名复用
const sharedSrc = fileURLToPath(new URL('../shared/src', import.meta.url))

export default defineConfig({
    test: {
        environment: 'node',
        include: ['__test__/**/*.test.ts'],
        setupFiles: ['./__test__/setup.ts'],
        // 每个测试文件独立进程，保证内存库数据相互隔离（满足数据隔离要求）
        pool: 'forks',
        testTimeout: 20000,
        hookTimeout: 20000,
        // drizzle-kit 不在 dependencies 中声明 drizzle-orm，pnpm 严格模式不链接；
        // 默认被当作 external 走 Node 原生解析，会绕过上面的 drizzle-orm 别名。
        // 内联后改由 vite 解析器处理，别名重定向才能生效。
        server: {
            deps: {
                inline: ['drizzle-kit'],
            },
        },
    },
    resolve: {
        alias: [
            // 将 drizzle-orm 及子路径（drizzle-orm/casing、/sqlite-core 等）重定向到已安装的包目录，
            // 解决 drizzle-kit 未声明该依赖导致 vite-node 解析失败的问题。
            { find: /^drizzle-orm(\/.*)?$/, replacement: (importee: string) => importee === 'drizzle-orm' ? drizzleOrmDir : join(drizzleOrmDir, importee.slice(11)) },
            { find: '@shared/utils', replacement: fileURLToPath(new URL('../shared/src/utils.ts', import.meta.url)) },
            { find: '@shared', replacement: sharedSrc },
            { find: '@shared/*', replacement: `${sharedSrc}/*` },
        ],
    },
    root: rootDir,
})
