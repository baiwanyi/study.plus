import { defineConfig } from 'drizzle-kit'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, 'data', 'study.db')

export default defineConfig({
    dialect: 'sqlite',
    dbCredentials: {
        url: `file:${dbPath}`,
    },
    schema: './src/db/schema.ts',
    out: './drizzle',
})
