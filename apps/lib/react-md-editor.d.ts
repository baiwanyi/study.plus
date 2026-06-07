declare module '@uiw/react-md-editor' {
    import { ComponentType } from 'react'

    /** 工具栏命令项 */
    interface ICommand {
        name?: string
        keyCommand?: string
        buttonProps?: Record<string, unknown>
        icon?: React.ReactNode
        execute?: (state: Record<string, unknown>) => void
    }

    /** 命令组 */
    interface ICommandGroup {
        name?: string
        commands?: ICommand[]
    }

    interface MDEditorProps {
        value?: string
        onChange?: (value: string) => void
        height?: number | string
        preview?: 'live' | 'edit' | 'preview'
        hideToolbar?: boolean
        placeholder?: string
        textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>
        previewOptions?: Record<string, unknown>
        /** 自定义工具栏命令（覆盖默认） */
        commands?: ICommandGroup[]
        /** 额外工具栏命令（追加到末尾） */
        extraCommands?: ICommandGroup[]
        /** 过滤/修改默认命令 */
        commandsFilter?: (command: ICommand) => ICommand | false | undefined
    }

    interface MarkdownProps {
        source?: string
    }

    const MDEditor: ComponentType<MDEditorProps> & {
        Markdown: ComponentType<MarkdownProps>
        /** 预定义命令 */
        commands: Record<string, ICommand>
        /** 预定义命令组 */
        getCommands: () => ICommandGroup[]
        /** 预定义额外命令组 */
        getExtraCommands: () => ICommandGroup[]
    }
    export default MDEditor
}
