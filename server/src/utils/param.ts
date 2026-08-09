/** 校验入参为正整数；非法返回 -1，调用方据此返回 400 */
export function parsePosInt(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}
