import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'
import { handwritingFontsPlugin } from './plugins/handwriting-fonts.ts'

export default defineConfig(({ mode }) => {
    // 后端端口取自仓库根目录 .env 的 PORT，避免与 .env 中端口写死导致不一致
    const env = loadEnv(mode, path.resolve(import.meta.dirname, '..'), [''])
    const backendPort = env.PORT || '3001'
    return {
        root: import.meta.dirname,
        // 最后一个插件扫描 public/fonts 生成内置字体清单，新增字体文件无需改代码；
        // 目录由 config 显式传入，插件内不自行推导路径，避免配置打包后基准不可靠
        plugins: [
            react(),
            // React Compiler 只处理组件与 hooks；用插件级 include 从源头跳过工具、类型等纯 .ts 模块，
            // 同时关闭生产构建不需要的 Babel source map，减少编译调用与映射生成开销。
            babel({
                include: [
                    /\.tsx(?:$|\?)/,
                    /[\\/]hooks[\\/][^\\/]+\.ts(?:$|\?)/,
                ],
                presets: [reactCompilerPreset()],
                sourceMap: false,
            }),
            handwritingFontsPlugin(path.resolve(import.meta.dirname, 'public', 'fonts')),
        ],
        resolve: {
            alias: {
                '@apps': path.resolve(import.meta.dirname, 'src'),
                '@components': path.resolve(import.meta.dirname, 'src', 'components'),
                '@shared': path.resolve(import.meta.dirname, '..', 'shared', 'src'),
            },
        },
        build: {
            // 前端产物直接输出到部署目录，不再先构建到仓库根再搬运。
            outDir: path.resolve(import.meta.dirname, '..', 'deploy', 'dist'),
            emptyOutDir: true,
            rollupOptions: {
                output: {
                    // 手动分包：按依赖族拆开，避免 Markdown 与公式挤进同一个超大 chunk。
                    // 编辑器已改用 nohighlight 入口，不再引入 prism / refractor，无需语法高亮分包规则。
                    manualChunks(id) {
                        if (id.includes('node_modules/react-dom')) {
                            return 'react-dom'
                        }
                        if (id.includes('node_modules/katex')) {
                            return 'katex'
                        }
                        if (
                            id.includes('node_modules/@uiw/react-md-editor') ||
                            id.includes('node_modules/@uiw/react-markdown-preview')
                        ) {
                            return 'md-editor'
                        }
                        if (
                            id.includes('node_modules/react-markdown') ||
                            id.includes('node_modules/remark-') ||
                            id.includes('node_modules/rehype-')
                        ) {
                            return 'markdown'
                        }
                        if (
                            id.includes('node_modules/axios') ||
                            id.includes('node_modules/@tanstack')
                        ) {
                            return 'vendor-http'
                        }
                    },
                },
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: `http://localhost:${backendPort}`,
                    changeOrigin: true,
                    timeout: 120_000,
                },
            },
        },
        // 全局唯一 env 文件位于仓库根目录（apps/ 的上一级）。
        // Vite 仅将 VITE_ 前缀变量注入客户端，其余变量仅服务端可见。
        envDir: path.resolve(import.meta.dirname, '..'),
        publicDir: 'public',
        optimizeDeps: {
            include: ['@uiw/react-md-editor'],
        },
    }
})
