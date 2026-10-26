/// <reference types="vite/client" />

declare module '@uiw/react-md-editor' {
    import { type TextAreaTextApi, type TextState } from '@uiw/react-md-editor'
    import type { JSX } from 'react'

    export interface ICommand {
        name?: string
        keyCommand: string
        buttonProps?: Record<string, unknown>
        icon?: JSX.Element | string
        execute?: (
            state: TextState,
            api: TextAreaTextApi,
        ) => void
    }

    export interface Commands {
        [key: string]: ICommand
    }

    export { TextAreaTextApi, TextState }
    export default MDEditor

    export const commands: Commands
}

/**
 * 内置字体清单：由 apps/plugins/handwriting-fonts.ts 在 dev 与 build 时扫描 public/fonts 生成。
 * 只声明清单形状，字体文件本身仍走 public 目录，不进 bundle。
 */
declare module 'virtual:handwriting-fonts' {
    import type { BuiltinFont } from '@shared/handwriting'

    export const builtinFonts: BuiltinFont[]
}
