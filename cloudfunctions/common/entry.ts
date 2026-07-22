import { fail, ok, HttpError, type ApiFailure, type ApiSuccess } from './errors'

/**
 * 云函数统一入口包装：捕获 HttpError 转为标准错误响应，
 * 未知异常记录日志并返回 500（不向客户端暴露堆栈）。
 */
export async function run<R>(
    fn: () => Promise<R>,
): Promise<ApiSuccess<R> | ApiFailure> {
    try {
        return ok(await fn())
    } catch (err) {
        if (err instanceof HttpError) {
            return fail(err.status, err.message, err.details)
        }
        const msg = err instanceof Error ? err.message : '服务器内部错误'
        console.error('[Function Error]', msg, err)
        // 【安全设计说明】不向客户端暴露内部错误详情，防止 SQL 语法/表结构/路径等信息泄露
        return fail(500, '服务器内部错误')
    }
}
