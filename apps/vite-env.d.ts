/// <reference types="vite/client" />

declare module '@uiw/react-md-editor' {
  import { ComponentType } from 'react'

  interface MDEditorProps {
    value?: string
    onChange?: (value: string) => void
    height?: number | string
    preview?: 'live' | 'edit' | 'preview'
    hideToolbar?: boolean
    previewOptions?: Record<string, unknown>
  }

  interface MarkdownProps {
    source?: string
  }

  const MDEditor: ComponentType<MDEditorProps> & {
    Markdown: ComponentType<MarkdownProps>
  }
  export default MDEditor
}
