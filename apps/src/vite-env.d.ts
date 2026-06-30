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
