import { callCloudFunction } from './api'

export interface UserInfo {
    id: number
    nickname: string
    avatar: string
    role: 'parent' | 'child'
}

export interface ChildItem {
    childId: number
    nickname: string
    grade: string
    sortOrder: number
}

export interface LoginResult {
    token: string
    privacyVersion: string
    user: UserInfo
    children: ChildItem[]
}

const TOKEN_KEY = 'loginToken'
const CHILD_KEY = 'currentChildId'
const USER_KEY = 'currentUser'

export function getToken(): string {
    return wx.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
    wx.setStorageSync(TOKEN_KEY, token)
}

export function isLoggedIn(): boolean {
    return Boolean(getToken())
}

export function getCurrentUser(): UserInfo | null {
    return wx.getStorageSync(USER_KEY) || null
}

export function setCurrentUser(user: UserInfo | null): void {
    if (user) {
        wx.setStorageSync(USER_KEY, user)
    } else {
        wx.removeStorageSync(USER_KEY)
    }
}

export function getCurrentRole(): 'parent' | 'child' | null {
    const user = getCurrentUser()
    return user ? user.role : null
}

export function getCurrentChildId(): number | null {
    const v = wx.getStorageSync(CHILD_KEY)
    return v ? Number(v) : null
}

export function setCurrentChildId(id: number | null): void {
    if (id == null) {
        wx.removeStorageSync(CHILD_KEY)
    } else {
        wx.setStorageSync(CHILD_KEY, id)
    }
}

/** 微信登录：调用 auth 云函数，openid 由平台注入，无需客户端传递 */
export async function login(
    nickname: string,
    avatar: string,
    privacyAgreed: boolean,
): Promise<LoginResult> {
    const res = await callCloudFunction<LoginResult>('auth', {
        nickname,
        avatar,
        privacyAgreed,
    })
    setToken(res.token)
    setCurrentUser(res.user)
    return res
}

export function logout(): void {
    wx.removeStorageSync(TOKEN_KEY)
    wx.removeStorageSync(CHILD_KEY)
    wx.removeStorageSync(USER_KEY)
}
