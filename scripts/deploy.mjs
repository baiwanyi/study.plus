/**
 * 部署产物组装脚本：把后端打包为自包含单文件，并收集运行时所需的全部资源。
 * 用 esbuild 将 server 源码与全部纯 JS 依赖内联为两个 ESM 入口；
 * 前端由 Vite 直接构建到 deploy/dist（见 apps/vite.config.ts），故须在前端构建之前执行，
 * 否则产物会被本脚本的清空步骤删除。
 * libsql 的原生二进制由 @neon-rs/load 在运行时动态加载、无法被静态内联，
 * 因此连同其依赖子树一并外置复制到产物目录，部署端无需执行任何依赖安装。
 */
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import * as esbuild from 'esbuild'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEPLOY_DIR = path.join(REPO_ROOT, 'deploy')

function resolvePackageRoot(resolver, specifier) {
    // 部分包的 exports 不暴露 ./package.json，故从主入口向上定位包根目录。
    const entry = fs.realpathSync(resolver.resolve(specifier))
    let dir = path.dirname(entry)
    while (!fs.existsSync(path.join(dir, 'package.json'))) {
        const parent = path.dirname(dir)
        if (parent === dir) {
            throw new Error(`未找到 ${specifier} 的包根目录`)
        }
        dir = parent
    }
    return dir
}

function removeStale(target) {
    // 逐项删除而非整体删除：一次性删除大目录在 Windows 上易被删除策略拦截。
    try {
        fs.rmSync(target, { recursive: true, force: true })
        return
    } catch {
        // 删除被拦截时改为移出产物目录，保证本次打包产出干净目录。
    }
    const stale = path.join(REPO_ROOT, `.deploy-stale-${Date.now()}`)
    fs.renameSync(target, stale)
    console.warn(`[clean] 旧产物已移至 ${stale}，可手动删除`)
}

function cleanDeployDir() {
    // deploy 是纯产物目录，每次重建其中的条目；
    // 生产数据请用 DB_PATH 指向本目录之外的绝对路径，避免随打包被清除。
    // dist 交由 Vite 的 emptyOutDir 在构建阶段清理，此处跳过。
    fs.mkdirSync(DEPLOY_DIR, { recursive: true })
    for (const entry of fs.readdirSync(DEPLOY_DIR, { withFileTypes: true })) {
        if (entry.name === 'dist') {
            continue
        }
        removeStale(path.join(DEPLOY_DIR, entry.name))
    }
}

async function bundleServer() {
    await esbuild.build({
        entryPoints: {
            server: path.join(REPO_ROOT, 'server', 'src', 'index.ts'),
            migrate: path.join(REPO_ROOT, 'server', 'src', 'db', 'migrate.ts'),
        },
        outdir: DEPLOY_DIR,
        outExtension: { '.js': '.mjs' },
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        // libsql 的原生二进制由 @neon-rs/load 运行时动态加载，无法静态内联，必须外置；
        // bufferutil / utf-8-validate 是 ws 的可选原生依赖，未安装时由运行时兜底。
        external: ['libsql', 'bufferutil', 'utf-8-validate'],
        // 部分 CJS 依赖（如 ws）内部使用 require() 调用 Node 内置模块，
        // ESM 输出下没有 require，需注入 createRequire 兜底，否则运行时抛
        // "Dynamic require of ... is not supported"。
        banner: {
            js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
        },
        alias: {
            '@shared': path.join(REPO_ROOT, 'shared', 'src'),
            '@study/shared': path.join(REPO_ROOT, 'shared', 'src', 'index.ts'),
        },
        minify: true,
        sourcemap: false,
        logLevel: 'info',
    })
}

function copyNativeRuntime() {
    // 以 server 包为解析基准，realpath 后即 pnpm 的虚拟 node_modules 根目录，
    // 整层复制可保证 libsql 与其依赖（@neon-rs/load、detect-libc、平台二进制）完整无遗漏。
    // libsql 不是 server 的直接依赖（pnpm 隔离链接），需先进入 @libsql/client 的
    // 虚拟 node_modules 才能解析到它，再定位 libsql 自身的虚拟目录。
    const serverRequire = createRequire(
        path.join(REPO_ROOT, 'server', 'package.json'),
    )
    const clientRoot = resolvePackageRoot(serverRequire, '@libsql/client')
    const clientRequire = createRequire(path.join(clientRoot, 'package.json'))
    const libsqlRoot = resolvePackageRoot(clientRequire, 'libsql')
    const virtualRoot = path.dirname(libsqlRoot)
    const targetRoot = path.join(DEPLOY_DIR, 'node_modules')

    for (const entry of fs.readdirSync(virtualRoot, { withFileTypes: true })) {
        // .bin 无需分发；*_tmp_* 是 pnpm 中断留下的临时残留，一并跳过。
        if (entry.name === '.bin' || entry.name.includes('_tmp_')) {
            continue
        }
        // pnpm 以 junction 形式链接依赖，dirent 类型为符号链接而非目录，需一并纳入。
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            continue
        }
        if (entry.name.startsWith('@')) {
            const scopeDir = path.join(virtualRoot, entry.name)
            const scopedEntries = fs.readdirSync(scopeDir, {
                withFileTypes: true,
            })
            for (const scoped of scopedEntries) {
                if (!scoped.isDirectory() && !scoped.isSymbolicLink()) {
                    continue
                }
                // dereference：pnpm 的依赖是 junction，复制链接在 Windows 上需要
                // 管理员权限（EPERM），展开为实体文件才能让产物拷贝到任意机器。
                fs.cpSync(
                    path.join(scopeDir, scoped.name),
                    path.join(targetRoot, entry.name, scoped.name),
                    { recursive: true, dereference: true },
                )
            }
            continue
        }
        fs.cpSync(
            path.join(virtualRoot, entry.name),
            path.join(targetRoot, entry.name),
            { recursive: true, dereference: true },
        )
    }
    assertPlatformBinary(targetRoot)
}

function assertPlatformBinary(targetRoot) {
    const abi = process.platform === 'win32' ? 'msvc' : 'gnu'
    const platformPackage = `@libsql/${process.platform}-${process.arch}-${abi}`
    if (!fs.existsSync(path.join(targetRoot, ...platformPackage.split('/')))) {
        throw new Error(
            `未找到平台原生包 ${platformPackage}，请在目标平台上执行打包`,
        )
    }
    console.log(`[native] 已复制 ${platformPackage}`)
}

function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function directorySize(target) {
    return fs
        .readdirSync(target, { withFileTypes: true })
        .reduce((sum, entry) => {
            const entryPath = path.join(target, entry.name)
            if (entry.isDirectory()) {
                return sum + directorySize(entryPath)
            }
            return sum + fs.statSync(entryPath).size
        }, 0)
}

function report() {
    console.log(`\n产物目录：${DEPLOY_DIR}`)
    for (const entry of fs.readdirSync(DEPLOY_DIR, { withFileTypes: true })) {
        const entryPath = path.join(DEPLOY_DIR, entry.name)
        const size = entry.isDirectory()
            ? directorySize(entryPath)
            : fs.statSync(entryPath).size
        console.log(`  ${entry.name.padEnd(20)}${formatSize(size)}`)
    }
}

async function main() {
    cleanDeployDir()
    await bundleServer()
    copyNativeRuntime()
    report()
}

main().catch((error) => {
    console.error('打包失败：', error instanceof Error ? error.message : error)
    process.exit(1)
})
