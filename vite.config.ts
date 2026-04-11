import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [
        react({
            babel: {
                plugins: [['babel-plugin-react-compiler']],
            },
        }),
        tsconfigPaths()
    ],
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
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
    optimizeDeps: {
        include: ['@uiw/react-md-editor'],
    },
})
