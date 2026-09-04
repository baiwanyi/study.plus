/**
 * 运行路径基准解析，为打包部署与本地开发提供统一入口。
 * 仅复用 Node 内置 path/fs，APP_ROOT 环境变量优先级最高，便于自定义数据与配置目录。
 * 打包后 bundle 已脱离源码树，若仍按源码层级反推目录会指向错误位置，
 * 故以源码布局探测区分两种运行形态：根目录解析错误将导致 .env 与数据库读取失败。
 * .env 与 SQLite 库以 APP_ROOT 为基准；前端产物以 CLIENT_ROOT 为基准，
 * 因为 Vite 直接构建到 deploy/dist，开发态的基准是仓库根下的 deploy 目录，
 * 部署态两者重合于部署目录本身。
 */
import fs from 'fs'
import path from 'path'

function resolveRoots(): {
    appRoot: string
    clientRoot: string
    parentRoot: string | null
} {
    if (process.env.APP_ROOT) {
        const appRoot = path.resolve(process.env.APP_ROOT)
        return { appRoot, clientRoot: appRoot, parentRoot: null }
    }
    // 开发态：本文件位于 server/src/paths.ts，上两级即仓库根（.env 与 deploy 所在）；
    // 打包态：以 bundle 自身所在目录为根，而非进程工作目录——
    // 这样无论从哪个目录启动（含系统服务的工作目录），产物都能定位自己的资源。
    const candidate = path.resolve(import.meta.dirname, '..', '..')
    const isSourceLayout = fs.existsSync(
        path.join(candidate, 'server', 'src', 'index.ts'),
    )
    if (isSourceLayout) {
        return {
            appRoot: candidate,
            clientRoot: path.join(candidate, 'deploy'),
            parentRoot: null,
        }
    }
    // 打包态以 bundle 自身目录为根；同时保留其上一级作为 .env 的回退查找位置，
    // 便于在仓库根直接试跑 deploy/server.mjs 时复用仓库根的 .env。
    const bundleRoot = import.meta.dirname
    return {
        appRoot: bundleRoot,
        clientRoot: bundleRoot,
        parentRoot: path.dirname(bundleRoot),
    }
}

const { appRoot, clientRoot, parentRoot } = resolveRoots()

export const APP_ROOT = appRoot
export const CLIENT_ROOT = clientRoot

export function resolveFromRoot(...segments: string[]): string {
    return path.resolve(APP_ROOT, ...segments)
}

export function resolveFromClientRoot(...segments: string[]): string {
    return path.resolve(CLIENT_ROOT, ...segments)
}

export function resolveDataDir(): string {
    // 与 .env 相同的场景判断：仓库内试跑时若自身 data 目录不存在，
    // 回退到上一级（仓库根）的 data 目录，避免产物运行时另建空库。
    const primary = path.join(APP_ROOT, 'data')
    if (!parentRoot || path.basename(APP_ROOT) !== 'deploy') {
        return primary
    }
    if (fs.existsSync(primary)) {
        return primary
    }
    const upper = path.join(parentRoot, 'data')
    return fs.existsSync(upper) ? upper : primary
}

export function resolveEnvPath(): string {
    // 产物位于名为 deploy 的子目录时属于「仓库内试跑」场景，
    // 直接使用上一级的 .env，避免同一份配置维护两份；
    // 独立部署（目录名非 deploy）时使用自身目录下的 .env。
    const primary = path.join(APP_ROOT, '.env')
    if (!parentRoot || path.basename(APP_ROOT) !== 'deploy') {
        return primary
    }
    const upper = path.join(parentRoot, '.env')
    return fs.existsSync(upper) ? upper : primary
}
