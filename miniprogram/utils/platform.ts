/**
 * 【PC 小程序】平台检测与响应式工具
 * 所有页面通过 app.globalData 获取平台状态
 */

export interface PlatformInfo {
    /** 是否为 PC 微信客户端 */
    isPC: boolean
    /** 当前窗口宽度（px） */
    windowWidth: number
    /** 当前窗口高度（px） */
    windowHeight: number
    /** 宽屏模式：PC 或窗口宽度 > 750px */
    isWide: boolean
}

const WIDE_BREAKPOINT = 750

export function initPlatform(): PlatformInfo {
    try {
        const sys = wx.getSystemInfoSync()
        const isPC = /Windows|Mac/i.test(sys.system)
        return {
            isPC,
            windowWidth: sys.windowWidth,
            windowHeight: sys.windowHeight,
            isWide: isPC || sys.windowWidth > WIDE_BREAKPOINT,
        }
    } catch {
        return { isPC: false, windowWidth: 375, windowHeight: 667, isWide: false }
    }
}

export function updatePlatformFromResize(
    size: { windowWidth: number; windowHeight: number },
): Partial<PlatformInfo> {
    return {
        windowWidth: size.windowWidth,
        windowHeight: size.windowHeight,
        isWide: size.windowWidth > WIDE_BREAKPOINT,
    }
}
