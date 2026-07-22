export const ENV_ID = process.env.ENV_ID || ''

export interface MysqlConfig {
    host: string
    port: number
    user: string
    password: string
    database: string
}

/**
 * 从环境变量读取 CloudBase MySQL 连接信息。
 * 部署时在 CloudBase 控制台配置以下变量，禁止硬编码。
 */
export function getMysqlConfig(): MysqlConfig {
    const host = process.env.MYSQL_HOST
    const user = process.env.MYSQL_USER
    const password = process.env.MYSQL_PASSWORD
    const database = process.env.MYSQL_DATABASE
    const port = Number(process.env.MYSQL_PORT || '3306')

    if (!host || !user || !database) {
        throw new Error('MySQL 环境变量未完整配置（MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE）')
    }

    return { host, port, user, password: password || '', database }
}

export const JWT_SECRET = process.env.JWT_SECRET || ''
export const JWT_EXPIRES_IN = '30d'

/** 校验 JWT 密钥是否就绪，未配置时显式抛出（fail-fast，禁止默认回退值） */
export function assertJwtSecret(): void {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET 未配置，无法签发/校验令牌')
    }
}

/** 隐私协议版本号，前端须匹配此版本才视为已同意 */
export const PRIVACY_VERSION = '2026-07-22'
