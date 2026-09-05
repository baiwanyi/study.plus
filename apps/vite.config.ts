import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'

export default defineConfig(({ mode }) => {
    // 后端端口取自仓库根目录 .env 的 PORT，避免与 .env 中端口写死导致不一致
    const env = loadEnv(mode, path.resolve(__dirname, '..'), [''])
    const backendPort = env.PORT || '3001'
    return {
        root: __dirname,
        plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
        resolve: {
            alias: {
                '@apps': path.resolve(__dirname, 'src'),
                '@components': path.resolve(__dirname, 'src', 'components'),
                '@shared': path.resolve(__dirname, '..', 'shared', 'src'),
            },
        },
        build: {
            // 前端产物直接输出到部署目录，不再先构建到仓库根再搬运。
            outDir: path.resolve(__dirname, '..', 'deploy', 'dist'),
            emptyOutDir: true,
            rollupOptions: {
                output: {
                    // 手动分包：把体积大的第三方依赖拆成独立 chunk，缓解主包 >500 kB 告警
                    manualChunks(id) {
                        if (id.includes('node_modules/react-dom')) {
                            return 'react-dom'
                        }
                        if (
                            id.includes('node_modules/@uiw/react-md-editor') ||
                            id.includes('node_modules/@uiw/react-markdown-preview') ||
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
        envDir: path.resolve(__dirname, '..'),
        publicDir: 'public',
        optimizeDeps: {
            include: ['@uiw/react-md-editor'],
        },
    }
})
