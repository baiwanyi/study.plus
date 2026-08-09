import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'

export default defineConfig({
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
        outDir: path.resolve(__dirname, '..', 'dist'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('react-dom')) {
                        return 'react-dom'
                    }
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3006',
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
})
