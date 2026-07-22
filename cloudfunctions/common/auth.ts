import jwt, { type JwtPayload as JwtLibPayload } from 'jsonwebtoken'
import { assertJwtSecret, JWT_EXPIRES_IN, JWT_SECRET } from './config'
import { HttpError } from './errors'

export type Role = 'parent' | 'child'

export interface JwtClaims {
    userId: number
    openid: string
    role: Role
    iat?: number
    exp?: number
}

/** 签发 JWT（openid + 用户ID + 角色，30 天过期） */
export function signToken(claims: Omit<JwtClaims, 'iat' | 'exp'>): string {
    assertJwtSecret()
    return jwt.sign(claims, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/** 校验 JWT，失败抛 HttpError(401) */
export function verifyToken(token: string): JwtClaims {
    assertJwtSecret()
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtLibPayload & JwtClaims
        return {
            userId: Number(decoded.userId),
            openid: String(decoded.openid),
            role: decoded.role as Role,
            iat: decoded.iat,
            exp: decoded.exp,
        }
    } catch {
        throw new HttpError(401, '令牌无效或已过期')
    }
}
