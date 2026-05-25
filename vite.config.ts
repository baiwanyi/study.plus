import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
    plugins: [
        react(),
        babel({ presets: [reactCompilerPreset()] }),
    ],
    resolve: {
        tsconfigPaths: true,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // 将 react-dom 单独拆分为一个文件
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
            },
        },
    },
    optimizeDeps: {
        include: ['@uiw/react-md-editor'],
    },
})
